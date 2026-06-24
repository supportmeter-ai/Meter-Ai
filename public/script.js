/* ═══════════════════════════════════════════════════════════════════
   Meter AI — Landing Page Interactions
   ═══════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  // Toast Notification System
  function showToast(title, message, variant = 'default') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `custom-toast`;
    
    let iconSvg = '';
    if (variant === 'success') {
      iconSvg = `<svg class="toast-icon success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    } else if (variant === 'error') {
      iconSvg = `<svg class="toast-icon error" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`;
    } else if (variant === 'warning') {
      iconSvg = `<svg class="toast-icon warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`;
    } else {
      iconSvg = `<svg class="toast-icon info" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>`;
    }

    toast.innerHTML = `
      ${iconSvg}
      <div class="toast-content">
        ${title ? `<div class="toast-title">${title}</div>` : ''}
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close" aria-label="Dismiss">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;

    container.appendChild(toast);

    toast.offsetHeight;
    toast.classList.add('show');

    const dismiss = () => {
      toast.classList.remove('show');
      toast.classList.add('hide');
      setTimeout(() => {
        toast.remove();
      }, 300);
    };

    toast.querySelector('.toast-close').addEventListener('click', dismiss);

    setTimeout(dismiss, 4000);
  }

  // ─── Staggered Letter splitting for animated-rolls ───────────
  document.querySelectorAll('.animated-roll').forEach(el => {
    const text = el.textContent.trim();
    el.innerHTML = '';
    
    const container = document.createElement('span');
    container.className = 'roll-container';
    
    const topLayer = document.createElement('span');
    topLayer.className = 'roll-layer roll-top';
    
    const bottomLayer = document.createElement('span');
    bottomLayer.className = 'roll-layer roll-bottom';
    
    text.split('').forEach((letter, i) => {
      const delay = 0.02 * i; // fast, elegant roll
      
      const spanTop = document.createElement('span');
      spanTop.textContent = letter === ' ' ? '\u00A0' : letter;
      spanTop.style.transitionDelay = `${delay}s`;
      topLayer.appendChild(spanTop);
      
      const spanBottom = document.createElement('span');
      spanBottom.textContent = letter === ' ' ? '\u00A0' : letter;
      spanBottom.style.transitionDelay = `${delay}s`;
      bottomLayer.appendChild(spanBottom);
    });
    
    container.appendChild(topLayer);
    container.appendChild(bottomLayer);
    el.appendChild(container);
  });

  // ─── Scroll-reveal animations ────────────────────────────────
  const observerOptions = { threshold: 0.05, rootMargin: '0px 0px -20px 0px' };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        // Stagger siblings for grid items
        const parent = entry.target.parentElement;
        const siblings = parent ? [...parent.querySelectorAll('.fade-in')] : [];
        const index = siblings.indexOf(entry.target);
        const delay = index >= 0 ? index * 40 : 0;

        setTimeout(() => {
          entry.target.classList.add('visible');
        }, delay);

        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

  // ─── FAQ accordion ──────────────────────────────────────────
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.parentElement;
      const isOpen = item.classList.contains('open');

      // Close all other items
      document.querySelectorAll('.faq-item.open').forEach(openItem => {
        if (openItem !== item) openItem.classList.remove('open');
      });

      item.classList.toggle('open', !isOpen);
    });
  });

  // ─── Smooth scroll for nav links ───────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const navHeight = 84;
        const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight;
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });

  // ─── Nav shadow & shrink on scroll ────────────────────────
  const nav = document.getElementById('nav');
  let ticking = false;

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        if (window.scrollY > 20) {
          nav.classList.add('scrolled');
        } else {
          nav.classList.remove('scrolled');
        }
        ticking = false;
      });
      ticking = true;
    }
  });

  // ─── Active tab on scroll (IntersectionObserver) ───────────
  const navTabs = document.querySelectorAll('.nav-tab');
  const observedSections = document.querySelectorAll('section[id]');
  
  const activeObserverOptions = {
    root: null,
    rootMargin: '-30% 0px -40% 0px',
    threshold: 0
  };

  const activeObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        const activeTab = document.querySelector(`.nav-tab[data-section="${id}"]`);
        if (activeTab) {
          navTabs.forEach(tab => tab.classList.remove('active'));
          activeTab.classList.add('active');
        }
      }
    });
  }, activeObserverOptions);

  observedSections.forEach(sec => {
    if (document.querySelector(`.nav-tab[data-section="${sec.id}"]`)) {
      activeObserver.observe(sec);
    }
  });

  // ─── Feedback Modal Logic ────────────────────────────────────
  const feedbackModal = document.getElementById('feedback-modal');
  const openModalBtns = [
    document.getElementById('footer-feedback-trigger'),
    document.getElementById('footer-help-trigger')
  ];
  const cancelModalBtn = document.getElementById('modal-cancel-btn');
  const doneModalBtn = document.getElementById('modal-success-done-btn');
  const feedbackForm = document.getElementById('feedback-modal-form');
  const modalFormContainer = document.getElementById('modal-form-container');
  const successState = document.getElementById('modal-success-state');

  // Fields and Errors
  const feedbackName = document.getElementById('modal-name');
  const feedbackEmail = document.getElementById('modal-email');
  const feedbackMessage = document.getElementById('modal-message');
  const charCount = document.getElementById('modal-char-count');
  
  const nameError = document.getElementById('modal-name-error');
  const emailError = document.getElementById('modal-email-error');
  const ratingError = document.getElementById('modal-rating-error');
  const messageError = document.getElementById('modal-message-error');

  const starBtns = document.querySelectorAll('.modal-star-btn');
  const selectedRatingInput = document.getElementById('modal-selected-rating');
  const ratingContainer = document.getElementById('modal-rating-container');

  // Open Modal
  openModalBtns.forEach(btn => {
    if (btn) {
      btn.addEventListener('click', () => {
        feedbackModal.style.display = 'flex';
        // Force reflow for transitions
        feedbackModal.offsetHeight;
        feedbackModal.classList.add('active');
        document.body.style.overflow = 'hidden';
      });
    }
  });

  // Auto-open modal if requested via URL query params (e.g. from Extension)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('feedback') === 'true' || urlParams.get('help') === 'true') {
    if (feedbackModal) {
      feedbackModal.style.display = 'flex';
      feedbackModal.offsetHeight;
      feedbackModal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  // Close Modal Helper
  function closeModal() {
    feedbackModal.classList.remove('active');
    document.body.style.overflow = '';
    setTimeout(() => {
      feedbackModal.style.display = 'none';
      resetFeedbackForm();
    }, 300);
  }

  if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);
  if (doneModalBtn) doneModalBtn.addEventListener('click', closeModal);

  // Close modal when clicking outside card
  feedbackModal.addEventListener('click', (e) => {
    if (e.target === feedbackModal) {
      closeModal();
    }
  });

  // Star Rating Selection
  function highlightStars(rating) {
    starBtns.forEach(btn => {
      const btnRating = parseInt(btn.getAttribute('data-rating'));
      const svg = btn.querySelector('svg');
      if (btnRating <= rating) {
        svg.classList.add('filled');
      } else {
        svg.classList.remove('filled');
      }
    });
  }

  starBtns.forEach(btn => {
    const rating = parseInt(btn.getAttribute('data-rating'));

    btn.addEventListener('click', () => {
      selectedRatingInput.value = rating;
      highlightStars(rating);
      if (ratingError) ratingError.style.display = 'none';
    });

    btn.addEventListener('mouseenter', () => {
      highlightStars(rating);
    });
  });

  if (ratingContainer) {
    ratingContainer.addEventListener('mouseleave', () => {
      const selected = parseInt(selectedRatingInput.value) || 0;
      highlightStars(selected);
    });
  }

  // Character Counter
  if (feedbackMessage) {
    feedbackMessage.addEventListener('input', () => {
      const length = feedbackMessage.value.length;
      if (charCount) charCount.textContent = `${length} / 500`;
      if (length > 0 && messageError) {
        messageError.style.display = 'none';
      }
    });
  }

  // Clear errors on typing
  if (feedbackName) {
    feedbackName.addEventListener('input', () => {
      if (feedbackName.value.trim() && nameError) {
        nameError.style.display = 'none';
      }
    });
  }

  if (feedbackEmail) {
    feedbackEmail.addEventListener('input', () => {
      const val = feedbackEmail.value.trim();
      if ((!val || val.includes('@')) && emailError) {
        emailError.style.display = 'none';
      }
    });
  }

  function resetFeedbackForm() {
    if (feedbackForm) feedbackForm.reset();
    if (selectedRatingInput) selectedRatingInput.value = '';
    highlightStars(0);
    if (charCount) charCount.textContent = '0 / 500';
    
    // Hide errors
    [nameError, emailError, ratingError, messageError].forEach(err => {
      if (err) err.style.display = 'none';
    });

    // Reset view visibility
    if (modalFormContainer) modalFormContainer.style.display = 'block';
    if (successState) successState.style.display = 'none';
  }

  // Form Submission
  if (feedbackForm) {
    feedbackForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      let isValid = true;

      // Validate Name
      if (!feedbackName.value.trim()) {
        if (nameError) nameError.style.display = 'block';
        isValid = false;
      } else {
        if (nameError) nameError.style.display = 'none';
      }

      // Validate Email
      const emailVal = feedbackEmail.value.trim();
      if (emailVal && !emailVal.includes('@')) {
        if (emailError) emailError.style.display = 'block';
        isValid = false;
      } else {
        if (emailError) emailError.style.display = 'none';
      }

      // Validate Rating
      if (!selectedRatingInput.value) {
        if (ratingError) ratingError.style.display = 'block';
        isValid = false;
      } else {
        if (ratingError) ratingError.style.display = 'none';
      }

      // Validate Message
      if (!feedbackMessage.value.trim()) {
        if (messageError) messageError.style.display = 'block';
        isValid = false;
      } else {
        if (messageError) messageError.style.display = 'none';
      }

      if (!isValid) return;

      // Loading state
      const submitBtn = document.getElementById('modal-submit-btn');
      const btnText = submitBtn.querySelector('.btn-text');
      const spinner = submitBtn.querySelector('.feedback-spinner');
      
      submitBtn.disabled = true;
      if (btnText) btnText.textContent = 'Sending...';
      if (spinner) spinner.style.display = 'inline-block';

      const payload = {
        name: feedbackName.value.trim(),
        email: emailVal || undefined,
        rating: parseInt(selectedRatingInput.value),
        message: feedbackMessage.value.trim()
      };

      try {
        const response = await fetch('/api/feedback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok && result.success) {
          if (modalFormContainer) modalFormContainer.style.display = 'none';
          if (successState) successState.style.display = 'flex';
        } else {
          showToast("Error", result.error || 'Server error. Please try again.', "error");
        }
      } catch (err) {
        console.error('API submission failed:', err);
        showToast("Error", 'Failed to connect to the server. Please check your connection.', "error");
      } finally {
        submitBtn.disabled = false;
        if (btnText) btnText.textContent = 'Submit Feedback';
        if (spinner) spinner.style.display = 'none';
      }
    });
  }

  // ─── Contact Support Modal Logic ─────────────────────────────
  const supportModal = document.getElementById('support-modal');
  const supportForm = document.getElementById('support-modal-form');
  const supportFormContainer = document.getElementById('support-form-container');
  const supportSuccessState = document.getElementById('support-success-state');
  const supportEmailInput = document.getElementById('support-email');
  const supportMessageInput = document.getElementById('support-message');
  
  const openSupportBtns = [
    document.getElementById('sub-modal-support-btn'),
    document.getElementById('legal-support-btn')
  ];
  
  const closeSupportBtns = [
    document.getElementById('support-modal-close-x'),
    document.getElementById('support-modal-cancel-btn'),
    document.getElementById('support-success-done-btn')
  ];

  // Helper to extract local profile
  function getLocalProfile() {
    try {
      const p = window.localStorage.getItem('meter_profile');
      return p ? JSON.parse(p) : null;
    } catch (e) {
      return null;
    }
  }

  // Open Support Modal
  openSupportBtns.forEach(btn => {
    if (btn) {
      btn.addEventListener('click', () => {
        // Auto-fill user email if logged in
        const profile = getLocalProfile();
        if (profile && profile.email && supportEmailInput) {
          supportEmailInput.value = profile.email;
        }

        // Close dashboard if open so support modal doesn't open in the background
        closeSubscriptionModal();

        if (supportModal) {
          supportModal.style.display = 'flex';
          supportModal.offsetHeight; // Force reflow
          supportModal.classList.add('active');
          document.body.style.overflow = 'hidden';
        }
      });
    }
  });

  // Close Support Modal
  function closeSupportModal() {
    if (supportModal) {
      supportModal.classList.remove('active');
      document.body.style.overflow = '';
      setTimeout(() => {
        supportModal.style.display = 'none';
        resetSupportForm();
      }, 300);
    }
  }

  closeSupportBtns.forEach(btn => {
    if (btn) btn.addEventListener('click', closeSupportModal);
  });

  if (supportModal) {
    supportModal.addEventListener('click', (e) => {
      if (e.target === supportModal) {
        closeSupportModal();
      }
    });
  }

  function resetSupportForm() {
    if (supportForm) supportForm.reset();
    if (supportFormContainer) supportFormContainer.style.display = 'block';
    if (supportSuccessState) supportSuccessState.style.display = 'none';
  }

  // Submit support request
  if (supportForm) {
    supportForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const emailVal = supportEmailInput ? supportEmailInput.value.trim() : '';
      const messageVal = supportMessageInput ? supportMessageInput.value.trim() : '';

      if (!emailVal || !messageVal) return;

      const submitBtn = document.getElementById('support-submit-btn');
      const btnText = submitBtn ? submitBtn.querySelector('.btn-text') : null;
      const spinner = submitBtn ? submitBtn.querySelector('.support-spinner') : null;

      if (submitBtn) submitBtn.disabled = true;
      if (btnText) btnText.textContent = 'Sending...';
      if (spinner) spinner.style.display = 'inline-block';

      // Gather active profile metadata if logged in
      const profile = getLocalProfile();
      let metadata = undefined;
      
      if (profile) {
        let planStr = 'Free';
        if (profile.plan === 'lifetime') planStr = 'Lifetime';
        else if (profile.plan === 'pro_monthly') planStr = 'Pro Monthly';

        metadata = {
          name: profile.full_name || 'User',
          email: profile.email || emailVal,
          plan: planStr,
          appVersion: '1.0.0',
          browserInfo: navigator.userAgent
        };
      }

      const payload = {
        email: emailVal,
        message: messageVal,
        metadata: metadata
      };

      try {
        const response = await fetch('/api/support', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok && result.success) {
          if (supportFormContainer) supportFormContainer.style.display = 'none';
          if (supportSuccessState) supportSuccessState.style.display = 'flex';
        } else {
          showToast("Error", result.error || 'Server error submitting support request. Please try again.', "error");
        }
      } catch (err) {
        console.error('Support submission error:', err);
        showToast("Error", 'Failed to connect to the server. Please check your connection.', "error");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (btnText) btnText.textContent = 'Send Support Request';
        if (spinner) spinner.style.display = 'none';
      }
    });
  }

  // ─── Re-initialize Animated Roll Helper ──────────────────────
  function reinitAnimatedRoll(el) {
    const text = el.textContent.trim();
    el.innerHTML = '';
    
    const container = document.createElement('span');
    container.className = 'roll-container';
    
    const topLayer = document.createElement('span');
    topLayer.className = 'roll-layer roll-top';
    
    const bottomLayer = document.createElement('span');
    bottomLayer.className = 'roll-layer roll-bottom';
    
    text.split('').forEach((letter, i) => {
      const delay = 0.02 * i;
      
      const spanTop = document.createElement('span');
      spanTop.textContent = letter === ' ' ? '\u00A0' : letter;
      spanTop.style.transitionDelay = `${delay}s`;
      topLayer.appendChild(spanTop);
      
      const spanBottom = document.createElement('span');
      spanBottom.textContent = letter === ' ' ? '\u00A0' : letter;
      spanBottom.style.transitionDelay = `${delay}s`;
      bottomLayer.appendChild(spanBottom);
    });
    
    container.appendChild(topLayer);
    container.appendChild(bottomLayer);
    el.appendChild(container);
  }

  // ─── Supabase Client & Payments Logic ────────────────────────
  const supabaseUrl = 'https://ojlamxgpcgchqrmpuugl.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qbGFteGdwY2djaHFybXB1dWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4Njc3ODMsImV4cCI6MjA5NzQ0Mzc4M30.cjqbrracZsSaHd2UhbU7E988TdnqtjTtRbeiLxrNwlk';
  let supabaseClient = null;

  if (typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
  }

  // Upgrade Plan Trigger
  async function triggerUpgrade(plan) {
    if (!supabaseClient) {
      showToast("Error", "Auth system failed to load. Please verify your connection.", "error");
      return;
    }

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      // Start Google Sign-In, redirecting back with trigger params
      await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '?login_success=true&plan=' + plan
        }
      });
      return;
    }

    const userEmail = session.user?.email || '';
    const userFullName = session.user?.user_metadata?.full_name || '';

    try {
      const response = await fetch('/api/upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ plan })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to create payment checkout.');
      }

      // Initialize Razorpay Options
      const options = {
        key: resData.key_id,
        name: "Meter AI Pro",
        description: plan === 'lifetime' ? "Lifetime Access Upgrade" : "Pro Monthly Subscription",
        image: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23D85A30' stroke-width='2.5'><path d='M20 20a8 8 0 0 0-16 0'/><line x1='12' y1='20' x2='16' y2='14'/><circle cx='12' cy='20' r='2'/></svg>",
        prefill: {
          name: userFullName,
          email: userEmail
        },
        theme: {
          color: "#D85A30" // Rust orange
        },
        handler: async function (response) {
          try {
            const body = {
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            };
            if (response.razorpay_subscription_id || resData.subscription_id) {
              body.razorpay_subscription_id = response.razorpay_subscription_id || resData.subscription_id;
            }
            if (response.razorpay_order_id || resData.order_id) {
              body.razorpay_order_id = response.razorpay_order_id || resData.order_id;
            }

            const verifyRes = await fetch('/api/razorpay/verify', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
              },
              body: JSON.stringify(body)
            });

            const verifyData = await verifyRes.json();
            if (!verifyRes.ok) {
              throw new Error(verifyData.error || "Payment verification failed.");
            }

            showToast("Success", "Payment verified successfully! Welcome to Meter AI Pro.", "success");
            checkAndSyncProfile(session.access_token);
          } catch (err) {
            console.error("Verification error:", err);
            showToast("Warning", "Payment completed but signature verification failed. Please check with support or try restoring your purchase.", "warning");
          }
        }
      };

      if (plan === 'pro_monthly') {
        options.subscription_id = resData.subscription_id;
      } else {
        options.order_id = resData.order_id;
      }

      const rzp = new Razorpay(options);
      rzp.open();

    } catch (err) {
      console.error("Upgrade checkout error:", err);
      showToast("Error", err.message || "Could not launch checkout. Please try again.", "error");
    }
  }

  // Restore Purchases Trigger
  async function triggerRestore() {
    if (!supabaseClient) return;

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      // Start Google Sign-In redirecting back to restore trigger
      await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '?restore_success=true'
        }
      });
      return;
    }

    try {
      const response = await fetch('/api/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      const data = await response.json();

      if (response.ok) {
        // Sync restored profile into localStorage and extension
        window.localStorage.setItem('meter_profile', JSON.stringify(data));
        window.dispatchEvent(new CustomEvent('meter-session-synced', { detail: data }));
        updateAuthUI(data);
        showToast("Success", `Purchase restored! Current Plan: ${data.plan.toUpperCase()}${data.premium ? ' (Lifetime)' : ''}`, "success");
      } else {
        showToast("Info", data.error || "No active plan was found for this Google account.", "info");
      }
    } catch (err) {
      console.error(err);
      showToast("Error", "Error restoring purchase. Please check your connection.", "error");
    }
  }

  // Query API to sync profile database updates into extension
  async function checkAndSyncProfile(token) {
    try {
      const response = await fetch('/api/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const profile = await response.json();
      if (response.ok) {
        window.localStorage.setItem('meter_profile', JSON.stringify(profile));
        window.dispatchEvent(new CustomEvent('meter-session-synced', { detail: profile }));
        updateAuthUI(profile);
        return profile;
      }
    } catch (e) {
      console.error('Failed to sync profile status:', e);
    }
    return null;
  }

  // Simple HTML Escaper for XSS mitigation
  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  // Helper to extract initials from profile name or email
  function getInitialsFromProfile(profile) {
    if (profile.full_name) {
      const parts = profile.full_name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return profile.full_name.slice(0, 2).toUpperCase();
    }
    if (profile.email) {
      return profile.email.slice(0, 2).toUpperCase();
    }
    return 'US';
  }

  // Helper to format plan name nicely
  function formatPlanName(plan) {
    if (plan === 'lifetime') return 'Lifetime';
    if (plan === 'pro_monthly') return 'Pro Monthly';
    return 'Free';
  }

  // Trigger Google Login
  async function triggerGoogleLogin() {
    if (!supabaseClient) {
      showToast("Error", "Auth system failed to load. Please verify your connection.", "error");
      return;
    }
    await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
  }

  // Update Auth Container UI State
  function updateAuthUI(profile) {
    const authContainer = document.getElementById('auth-status-container');
    if (!authContainer) return;

    let displayHtml = '';
    let badgeClass = 'profile-verified-badge'; // Always visible by default
    let badgeSvg = '';
    let dropdownInnerHtml = '';

    if (profile) {
      // User is logged in
      const hasAvatar = !!profile.avatar_url;
      const initials = getInitialsFromProfile(profile);
      const avatarHtml = hasAvatar 
        ? `<img src="${escapeHTML(profile.avatar_url)}" alt="user" />` 
        : `<span>${escapeHTML(initials)}</span>`;

      displayHtml = avatarHtml;

      // Resolve badge class and SVG for avatar button
      if (profile.plan === 'lifetime') {
        badgeClass += ' badge-lifetime';
        badgeSvg = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 12l10 10 10-10L12 2z"/></svg>`;
      } else if (profile.plan === 'pro_monthly') {
        badgeClass += ' badge-pro';
        badgeSvg = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
      } else {
        // Free user avatar badge (blue checkmark representing signed in)
        badgeClass += ' badge-free';
        badgeSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width: 8px; height: 8px; color: #ffffff;"><polyline points="20 6 9 17 4 12"/></svg>`;
      }

      dropdownInnerHtml = `
        <div class="dropdown-header logged-in-header">
          <div class="header-profile-card">
            <div class="header-profile-avatar">
              ${avatarHtml}
            </div>
            <div class="header-profile-info">
              <div class="profile-name-row">
                <span class="profile-name">${escapeHTML(profile.full_name || 'User')}</span>
                ${profile.plan === 'lifetime' ? '<span class="badge-lifetime-tag"><svg class="badge-star-icon" style="fill: #8AB4F8;" viewBox="0 0 24 24"><path d="M12 2L2 12l10 10 10-10L12 2z"/></svg>Lifetime</span>' : (profile.plan === 'pro_monthly' ? '<span class="badge-pro-tag"><svg class="badge-star-icon" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>Pro</span>' : '')}
              </div>
              <span class="profile-email">${escapeHTML(profile.email || '')}</span>
            </div>
          </div>
        </div>
        <div class="dropdown-divider"></div>
        <div class="dropdown-section">
          <div class="section-label-small">Plan Status</div>
          <div class="profile-plan-status">
            <span class="plan-status-value">${formatPlanName(profile.plan)}</span>
            <span class="plan-status-indicator status-${profile.subscription_status}">${(profile.subscription_status || 'active').toUpperCase()}</span>
          </div>
        </div>
        <div class="dropdown-divider"></div>
        <ul class="dropdown-menu-list">
          ${profile.plan === 'free' ? `
          <li>
            <button id="btn-dropdown-restore" class="dropdown-menu-item">
              <svg class="menu-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg>
              Restore Purchase
            </button>
          </li>
          <li>
            <button id="btn-dropdown-upgrade" class="dropdown-menu-item dropdown-menu-item-accent">
              <svg class="menu-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              Upgrade to Pro
            </button>
          </li>
          ` : ''}
          <li>
            <button id="btn-dropdown-manage" class="dropdown-menu-item">
              <svg class="menu-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="4"/>
                <line x1="8" y1="2" x2="8" y2="4"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              Manage Subscription
            </button>
          </li>
        </ul>
        <div class="dropdown-divider"></div>
        <div class="dropdown-footer">
          <button id="btn-dropdown-logout" class="dropdown-logout-btn">
            <svg class="menu-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            Sign Out
          </button>
        </div>
      `;
    } else {
      // User is logged out
      displayHtml = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="avatar-placeholder-svg">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      `;

      badgeClass = 'profile-verified-badge badge-free';
      badgeSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width: 8px; height: 8px; color: #ffffff;"><polyline points="20 6 9 17 4 12"/></svg>`;

      dropdownInnerHtml = `
        <div class="dropdown-header logged-out-header">
          <h4>Sign in to Meter AI</h4>
          <p>Restore purchases, manage plan status, or upgrade to Pro.</p>
        </div>
        <div class="dropdown-divider"></div>
        <div class="dropdown-actions">
          <button id="btn-dropdown-login" class="btn dropdown-btn-login">
            <svg viewBox="0 0 24 24" class="google-icon" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
        </div>
      `;
    }

    authContainer.innerHTML = `
      <div class="profile-avatar-wrapper">
        <button id="profile-avatar-btn" class="profile-avatar-btn" aria-label="Account Menu">
          <div id="profile-avatar-display" class="profile-avatar-display">
            ${displayHtml}
          </div>
          <span id="profile-verified-badge" class="${badgeClass}" title="Member Status">
            ${badgeSvg}
          </span>
        </button>
        
        <div id="profile-dropdown" class="profile-dropdown">
          ${dropdownInnerHtml}
        </div>
      </div>
    `;

    // Attach Toggle Listener
    const avatarBtn = document.getElementById('profile-avatar-btn');
    const dropdown = document.getElementById('profile-dropdown');

    if (avatarBtn && dropdown) {
      avatarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('active');
      });
    }

    // Attach Menu Handlers
    if (profile) {
      document.getElementById('btn-dropdown-logout')?.addEventListener('click', () => {
        dropdown.classList.remove('active');
        handleLogout();
      });
      document.getElementById('btn-dropdown-restore')?.addEventListener('click', () => {
        dropdown.classList.remove('active');
        triggerRestore();
      });
      document.getElementById('btn-dropdown-upgrade')?.addEventListener('click', () => {
        dropdown.classList.remove('active');
        const pricingSec = document.getElementById('pricing');
        if (pricingSec) {
          pricingSec.scrollIntoView({ behavior: 'smooth' });
        }
      });
      document.getElementById('btn-dropdown-manage')?.addEventListener('click', async () => {
        dropdown.classList.remove('active');
        // Always fetch fresh profile so subscription dates are up-to-date
        const token = window.localStorage.getItem('meter_auth_token');
        if (token) {
          const freshProfile = await checkAndSyncProfile(token);
          openSubscriptionModal(freshProfile || profile);
        } else {
          openSubscriptionModal(profile);
        }
      });
    } else {
      document.getElementById('btn-dropdown-login')?.addEventListener('click', () => {
        dropdown.classList.remove('active');
        triggerGoogleLogin();
      });
    }
  }

  // ─── Subscription Modal / Account Center Logic ─────────────────
  const subModal = document.getElementById('subscription-modal');
  const closeSubModalBtn = document.getElementById('sub-modal-close-btn');
  const closeSubModalXBtn = document.getElementById('sub-modal-close-x');

  function openSubscriptionModal(profile) {
    if (!subModal || !profile) return;

    // Populate Account details and initials fallback
    const nameEl = document.getElementById('sub-modal-name');
    const emailEl = document.getElementById('sub-modal-email');
    if (nameEl) nameEl.textContent = profile.full_name || 'User';
    if (emailEl) emailEl.textContent = profile.email || '';

    // Handle large modal avatar and fallback initials
    const avatarLargeEl = document.getElementById('sub-modal-avatar-large');
    const avatarBadgeEl = document.getElementById('sub-modal-avatar-badge');
    
    if (avatarLargeEl) {
      const hasAvatar = !!profile.avatar_url;
      const initials = getInitialsFromProfile(profile);
      avatarLargeEl.innerHTML = hasAvatar 
        ? `<img src="${escapeHTML(profile.avatar_url)}" alt="user" />` 
        : `<span>${escapeHTML(initials)}</span>`;
    }

    if (avatarBadgeEl) {
      let badgeClass = 'profile-verified-badge large-badge';
      let badgeSvg = '';
      if (profile.plan === 'lifetime') {
        badgeClass += ' badge-lifetime';
        badgeSvg = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 12l10 10 10-10L12 2z"/></svg>`;
        avatarBadgeEl.className = badgeClass;
        avatarBadgeEl.innerHTML = badgeSvg;
      } else if (profile.plan === 'pro_monthly') {
        badgeClass += ' badge-pro';
        badgeSvg = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
        avatarBadgeEl.className = badgeClass;
        avatarBadgeEl.innerHTML = badgeSvg;
      } else {
        badgeClass += ' badge-free';
        badgeSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width: 10px; height: 10px; color: #ffffff;"><polyline points="20 6 9 17 4 12"/></svg>`;
        avatarBadgeEl.className = badgeClass;
        avatarBadgeEl.innerHTML = badgeSvg;
      }
    }

    // Populate Plan details
    const planEl = document.getElementById('sub-modal-plan');
    const statusEl = document.getElementById('sub-modal-status');
    const startedEl = document.getElementById('sub-modal-started');
    const expiresEl = document.getElementById('sub-modal-expires');

    const startedRow = document.getElementById('row-modal-started');
    const expiresRow = document.getElementById('row-modal-expires');

    // Reset plan badges
    if (planEl) {
      planEl.className = 'detail-value plan-value-badge';
      if (profile.plan === 'lifetime') {
        planEl.innerHTML = '💎 Lifetime';
      } else if (profile.plan === 'pro_monthly') {
        planEl.innerHTML = '⭐ Pro Monthly';
      } else {
        planEl.innerHTML = 'Free';
      }
    }

    if (statusEl) {
      statusEl.className = `detail-value status-value-badge ${profile.subscription_status || 'active'}`;
      statusEl.textContent = (profile.subscription_status || 'active').toUpperCase();
    }

    // Helper to format date
    function formatDate(dateStr) {
      if (!dateStr) return '—';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    }

    // Select the new UI rows and labels
    const labelStartedEl = document.getElementById('label-modal-started');
    const labelExpiresEl = document.getElementById('label-modal-expires');

    // Handle conditional timeline rows based on Plan Type
    if (profile.plan === 'lifetime') {
      if (labelStartedEl) labelStartedEl.textContent = 'Member Since';
      if (labelExpiresEl) labelExpiresEl.textContent = 'Expires';
      if (startedRow) startedRow.style.display = 'block';
      if (expiresRow) expiresRow.style.display = 'block';

      if (startedEl) startedEl.textContent = formatDate(profile.plan_started_at);
      if (expiresEl) expiresEl.textContent = 'Never';
    } else if (profile.plan === 'pro_monthly') {
      if (labelStartedEl) labelStartedEl.textContent = 'Started On';
      if (labelExpiresEl) labelExpiresEl.textContent = 'Next Billing Date';
      if (startedRow) startedRow.style.display = 'block';
      if (expiresRow) expiresRow.style.display = 'block';

      if (startedEl) startedEl.textContent = formatDate(profile.plan_started_at);
      if (expiresEl) expiresEl.textContent = formatDate(profile.subscription_end);
    } else {
      // Free Plan
      if (labelStartedEl) labelStartedEl.textContent = 'Member Since';
      if (labelExpiresEl) labelExpiresEl.textContent = 'Expires';
      if (startedRow) startedRow.style.display = 'none';
      if (expiresRow) expiresRow.style.display = 'block';

      if (expiresEl) expiresEl.textContent = 'Never';
    }

    // Benefits icon checks enabling/disabling
    const icons = {
      handoff: document.getElementById('benefit-icon-handoff'),
      analytics: document.getElementById('benefit-icon-analytics'),
      early: document.getElementById('benefit-icon-early'),
      support: document.getElementById('benefit-icon-support')
    };

    const isPremium = profile.plan === 'pro_monthly' || profile.plan === 'lifetime';

    Object.entries(icons).forEach(([key, icon]) => {
      if (icon) {
        if (isPremium) {
          icon.setAttribute('class', 'benefit-icon enabled');
          icon.innerHTML = '<polyline points="20 6 9 17 4 12"/>';
        } else {
          icon.setAttribute('class', 'benefit-icon disabled');
          icon.innerHTML = '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>';
        }
      }
    });

    // Show modal
    subModal.style.display = 'flex';
    subModal.offsetHeight;
    subModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeSubscriptionModal() {
    if (!subModal) return;
    subModal.classList.remove('active');
    document.body.style.overflow = '';
    setTimeout(() => {
      subModal.style.display = 'none';
    }, 300);
  }

  if (closeSubModalBtn) {
    closeSubModalBtn.addEventListener('click', closeSubscriptionModal);
  }

  if (closeSubModalXBtn) {
    closeSubModalXBtn.addEventListener('click', closeSubscriptionModal);
  }

  if (subModal) {
    subModal.addEventListener('click', (e) => {
      // Dismiss only if clicking outside the card itself
      const card = subModal.querySelector('.subscription-modal-card');
      if (card && !card.contains(e.target)) {
        closeSubscriptionModal();
      }
    });
  }

  // Escape key dismisses Account Center modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && subModal && subModal.classList.contains('active')) {
      closeSubscriptionModal();
    }
  });

  // Close profile dropdown when clicking outside
  window.addEventListener('click', () => {
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown && dropdown.classList.contains('active')) {
      dropdown.classList.remove('active');
    }
  });

  // Handle user logout
  async function handleLogout() {
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
      window.localStorage.removeItem('meter_profile');
      window.localStorage.removeItem('meter_auth_token');
      window.dispatchEvent(new CustomEvent('meter-session-logged-out'));
      updateAuthUI(null);
      showToast("Success", "Signed out successfully.", "success");
    }
  }

  // Set up button event triggers
  document.querySelectorAll('.upgrade-button').forEach(btn => {
    btn.addEventListener('click', () => {
      const plan = btn.getAttribute('data-plan');
      triggerUpgrade(plan);
    });
  });

  // Handle auth flow state changes
  if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (session) {
        window.localStorage.setItem('meter_auth_token', session.access_token);
        checkAndSyncProfile(session.access_token);
      } else {
        window.localStorage.removeItem('meter_profile');
        window.localStorage.removeItem('meter_auth_token');
        updateAuthUI(null);
      }
    });

    // Check redirect flags on page load
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('login_success') === 'true') {
      const plan = urlParams.get('plan');
      window.history.replaceState({}, document.title, window.location.pathname);
      setTimeout(() => triggerUpgrade(plan), 800);
    } else if (urlParams.get('restore_success') === 'true') {
      window.history.replaceState({}, document.title, window.location.pathname);
      setTimeout(() => triggerRestore(), 800);
    }
  }

  // Pricing toggle view switcher
  const toggleMonthly = document.getElementById('toggle-monthly');
  const toggleLifetime = document.getElementById('toggle-lifetime');
  const billingToggle = document.getElementById('billing-toggle');
  const cardMonthly = document.getElementById('card-monthly');
  const cardLifetime = document.getElementById('card-lifetime');
  const badgeMonthlyPop = document.getElementById('badge-monthly-pop');
  const badgeLifetimeBest = document.getElementById('badge-lifetime-best');

  if (toggleMonthly && toggleLifetime && billingToggle && cardMonthly && cardLifetime) {
    const setPricingView = (view) => {
      if (view === 'monthly') {
        billingToggle.classList.remove('lifetime-active');
        toggleMonthly.classList.add('active');
        toggleLifetime.classList.remove('active');
        
        cardMonthly.classList.add('highlighted');
        cardLifetime.classList.remove('highlighted');
        
        if (badgeMonthlyPop) badgeMonthlyPop.style.display = 'inline-flex';
        if (badgeLifetimeBest) badgeLifetimeBest.style.display = 'none';
      } else {
        billingToggle.classList.add('lifetime-active');
        toggleMonthly.classList.remove('active');
        toggleLifetime.classList.add('active');
        
        cardMonthly.classList.remove('highlighted');
        cardLifetime.classList.add('highlighted');
        
        if (badgeMonthlyPop) badgeMonthlyPop.style.display = 'none';
        if (badgeLifetimeBest) badgeLifetimeBest.style.display = 'inline-flex';
      }
    };

    toggleMonthly.addEventListener('click', () => setPricingView('monthly'));
    toggleLifetime.addEventListener('click', () => setPricingView('lifetime'));
    
    // Set default view on load
    setPricingView('monthly');
  }

  // ─── Sparkles Infinite Slider Integration ──────────────────────
  const featuresList = [
    "Live Usage Tracking",
    "Weekly Quota Estimation",
    "Cross-LLM Handoff",
    "Privacy First",
    "Offline Session Parsing",
    "Local Storage",
    "No Mandatory Account",
    "Google Sign-In Sync",
    "Premium Analytics",
    "Restore Purchases",
    "Fast Export",
    "Lightweight Extension"
  ];

  function renderFeaturesMarquee() {
    const track = document.getElementById('features-marquee-track');
    if (!track) return;

    // Render twice for seamless infinite scrolling loop
    const doubleFeatures = [...featuresList, ...featuresList];
    track.innerHTML = doubleFeatures.map(feat => `
      <button class="slider-pill">
        ${escapeHTML(feat)}
      </button>
    `).join('');
  }

  // Run on startup
  renderFeaturesMarquee();
});
