-- Database initialization script for Meter AI Supabase Backend

-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'beta', 'moderator')),
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro_monthly', 'lifetime')),
  subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'cancelled', 'expired', 'pending')),
  razorpay_customer_id TEXT,
  razorpay_subscription_id TEXT,
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  plan_started_at TIMESTAMPTZ,
  subscription_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create select policy to allow authenticated users to read their own profile
DROP POLICY IF EXISTS "Allow users to read their own profiles" ON public.profiles;
CREATE POLICY "Allow users to read their own profiles" 
  ON public.profiles 
  FOR SELECT 
  USING (auth.uid() = id);

-- Indexes for performance optimizations
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_razorpay_customer_id ON public.profiles(razorpay_customer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_plan ON public.profiles(plan);

-- Trigger function to automatically create a user profile in public.profiles when signing up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    email, 
    full_name, 
    avatar_url, 
    role, 
    plan, 
    subscription_status
  )
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    COALESCE(new.raw_user_meta_data->>'avatar_url', ''),
    'user',
    'free',
    'active'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger execution setup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger function for automated updated_at timestamp updating
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger execution setup
CREATE OR REPLACE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create subscription_events audit log table
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  payment_id TEXT,
  subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on subscription_events
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own events for transparency
DROP POLICY IF EXISTS "Allow users to read their own subscription events" ON public.subscription_events;
CREATE POLICY "Allow users to read their own subscription events" 
  ON public.subscription_events 
  FOR SELECT 
  USING (auth.uid() = user_id);

-- Indexes for events query optimization
CREATE INDEX IF NOT EXISTS idx_subscription_events_user_id ON public.subscription_events(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_created_at ON public.subscription_events(created_at);

-- Create admin_feedback table
CREATE TABLE IF NOT EXISTS public.admin_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_email TEXT,
  user_name TEXT,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on admin_feedback
ALTER TABLE public.admin_feedback ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert feedback, but only admin role can read/write
DROP POLICY IF EXISTS "Allow authenticated/anonymous insert feedback" ON public.admin_feedback;
DROP POLICY IF EXISTS "Allow admins all actions on feedback" ON public.admin_feedback;
CREATE POLICY "Allow authenticated/anonymous insert feedback" ON public.admin_feedback FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow admins all actions on feedback" ON public.admin_feedback FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- Create admin_support table
CREATE TABLE IF NOT EXISTS public.admin_support (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  user_name TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'in_progress')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on admin_support
ALTER TABLE public.admin_support ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert support, but only admin role can read/write
DROP POLICY IF EXISTS "Allow authenticated/anonymous insert support" ON public.admin_support;
DROP POLICY IF EXISTS "Allow admins all actions on support" ON public.admin_support;
CREATE POLICY "Allow authenticated/anonymous insert support" ON public.admin_support FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow admins all actions on support" ON public.admin_support FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- Trigger for auto updated_at on support tickets
CREATE OR REPLACE TRIGGER update_admin_support_updated_at
  BEFORE UPDATE ON public.admin_support
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create admin_notes table for scratchpad and tasks
CREATE TABLE IF NOT EXISTS public.admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notes_content TEXT DEFAULT '',
  tasks_json JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on admin_notes
ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;

-- Allow only admins to read and write notes
DROP POLICY IF EXISTS "Allow admins all actions on notes" ON public.admin_notes;
CREATE POLICY "Allow admins all actions on notes" ON public.admin_notes FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- Insert a default row if table is empty
INSERT INTO public.admin_notes (notes_content, tasks_json)
SELECT '', '[]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.admin_notes);

-- Create kanban_tasks table for structured Kanban card persistence
CREATE TABLE IF NOT EXISTS public.kanban_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  "desc" TEXT DEFAULT '',
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  "column" TEXT DEFAULT 'backlog' CHECK ("column" IN ('backlog', 'todo', 'in_progress', 'done')),
  labels TEXT[] DEFAULT '{}',
  due_date TIMESTAMPTZ,
  completed BOOLEAN DEFAULT FALSE,
  created BIGINT,
  updated BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) on kanban_tasks
ALTER TABLE public.kanban_tasks ENABLE ROW LEVEL SECURITY;

-- Allow only admins all actions on kanban_tasks
DROP POLICY IF EXISTS "Allow admins all actions on kanban_tasks" ON public.kanban_tasks;
CREATE POLICY "Allow admins all actions on kanban_tasks" ON public.kanban_tasks FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- Trigger for auto updated_at on kanban_tasks
CREATE OR REPLACE TRIGGER update_kanban_tasks_updated_at
  BEFORE UPDATE ON public.kanban_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_kanban_tasks_column ON public.kanban_tasks("column");
CREATE INDEX IF NOT EXISTS idx_kanban_tasks_priority ON public.kanban_tasks(priority);


