const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Pooler connection config — reads from DATABASE_URL env var
// Set DATABASE_URL in your .env file (see .env.example) before running
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL is not set. Please configure your .env file.');
  process.exit(1);
}
const poolerConfig = {
  connectionString,
  ssl: { rejectUnauthorized: false }
};

async function run() {
  console.log("=========================================");
  console.log("   METER AI DATABASE SCHEMA MIGRATOR    ");
  console.log("=========================================\n");
  
  console.log("Connecting to database pooler...");
  const client = new Client(poolerConfig);
  
  try {
    await client.connect();
    console.log("✅ Connected successfully!");
  } catch (err) {
    console.error("\n❌ Connection Failed!");
    console.error("Reason:", err.message);
    if (err.message.includes("tenant/user postgres.ojlamxgpcgchqrmpuugl not found")) {
      console.log("\n💡 Troubleshooting advice:");
      console.log("Connection pooling is currently disabled for your project.");
      console.log("Please go to your Supabase Dashboard -> Project Settings -> Database -> Connection Pooling");
      console.log("and enable connection pooling, then run this script again.");
    }
    process.exit(1);
  }

  // 1. Read schema.sql
  const schemaPath = path.join(__dirname, 'schema.sql');
  console.log(`\nReading database schema from: ${schemaPath}...`);
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  // 2. Execute migrations
  console.log("Applying schema migrations to Supabase...");
  try {
    await client.query(schemaSql);
    console.log("✅ Schema migrations applied successfully!");
  } catch (err) {
    console.error("❌ Failed to apply migrations:", err.message);
    await client.end();
    process.exit(1);
  }

  // 3. Verification Suite
  console.log("\n=========================================");
  console.log("       VERIFYING DATABASE OBJECTS        ");
  console.log("=========================================\n");

  // Check profiles table existence
  const tableCheck = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'profiles'
    );
  `);
  const profilesExist = tableCheck.rows[0].exists;
  console.log(`1. Table 'profiles' exists: ${profilesExist ? '✅ YES' : '❌ NO'}`);

  if (profilesExist) {
    // Check columns
    const expectedColumns = [
      'id', 'email', 'full_name', 'avatar_url', 'role', 'plan', 
      'subscription_status', 'razorpay_customer_id', 'razorpay_subscription_id', 
      'razorpay_order_id', 'razorpay_payment_id', 'plan_started_at', 
      'subscription_end', 'created_at', 'updated_at'
    ];
    
    const columnsRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'profiles';
    `);
    
    const actualColumns = columnsRes.rows.map(r => r.column_name);
    const missingColumns = expectedColumns.filter(c => !actualColumns.includes(c));
    
    if (missingColumns.length === 0) {
      console.log("2. Table columns: ✅ ALL MATCH EXPECTED");
    } else {
      console.log(`2. Table columns: ❌ MISSING COLUMNS: ${missingColumns.join(', ')}`);
    }

    // Check Row Level Security (RLS) status
    const rlsRes = await client.query(`
      SELECT relrowsecurity 
      FROM pg_class 
      WHERE relname = 'profiles';
    `);
    const rlsEnabled = rlsRes.rows[0].relrowsecurity;
    console.log(`3. Row Level Security (RLS) enabled: ${rlsEnabled ? '✅ YES' : '❌ NO'}`);

    // Check handle_new_user function
    const funcRes = await client.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' 
      AND routine_name = 'handle_new_user';
    `);
    const funcExists = funcRes.rows.length > 0;
    console.log(`4. Function 'handle_new_user()' exists: ${funcExists ? '✅ YES' : '❌ NO'}`);

    // Check triggers
    const triggerRes = await client.query(`
      SELECT trigger_name, event_manipulation, event_object_table 
      FROM information_schema.triggers
      WHERE event_object_table = 'profiles' 
         OR trigger_name = 'on_auth_user_created';
    `);
    
    const triggerNames = triggerRes.rows.map(r => r.trigger_name);
    const hasAuthTrigger = triggerNames.includes('on_auth_user_created');
    const hasUpdateTrigger = triggerNames.includes('update_profiles_updated_at');
    
    console.log(`5. Auth Signup trigger 'on_auth_user_created' exists: ${hasAuthTrigger ? '✅ YES' : '❌ NO'}`);
    console.log(`6. Auto-timestamp trigger 'update_profiles_updated_at' exists: ${hasUpdateTrigger ? '✅ YES' : '❌ NO'}`);

    // Check RLS policies
    const policyRes = await client.query(`
      SELECT policyname 
      FROM pg_policies 
      WHERE tablename = 'profiles';
    `);
    const policies = policyRes.rows.map(r => r.policyname);
    console.log(`7. RLS Policies found: ${policies.length > 0 ? `✅ YES (${policies.join(', ')})` : '❌ NO'}`);
  }

  await client.end();
  console.log("\n=========================================");
  console.log("          MIGRATION COMPLETE!            ");
  console.log("=========================================");
}

run().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
