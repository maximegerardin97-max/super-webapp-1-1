// Login Screen JavaScript
class LoginApp {
    constructor() {
        this.supabase = null;
        this.isWaiting = false;
        this.init();
    }

    async init() {
        // Initialize Supabase client (singleton across app pages)
        if (!window.__SB_CLIENT__) {
            window.__SB_CLIENT__ = window.supabase.createClient(
                window.AGENT_CFG.SUPABASE_URL,
                window.AGENT_CFG.SUPABASE_ANON,
                { auth: { storageKey: 'sb-design-context-auth' } }
            );
        }
        this.supabase = window.__SB_CLIENT__;

        // If returning from a magic link/OAuth, finalize the session first
        await this.handleAuthRedirect();

        // Check if user is already authenticated
        await this.checkAuthState();

        // Setup event listeners
        this.setupEventListeners();
    }

    async handleAuthRedirect() {
        try {
            const url = new URL(window.location.href);

            // Case 1: OAuth or code-based redirects (?code=...)
            const code = url.searchParams.get('code');
            if (code) {
                await this.supabase.auth.exchangeCodeForSession(window.location.href);
                // Clean URL
                window.history.replaceState({}, document.title, url.pathname);
                // Go to app
                window.location.replace('index.html');
                return true;
            }

            // Case 2: Magic link with hash tokens (#access_token=...&refresh_token=...)
            if (url.hash && url.hash.includes('access_token')) {
                const hashParams = new URLSearchParams(url.hash.replace('#', ''));
                const access_token = hashParams.get('access_token');
                const refresh_token = hashParams.get('refresh_token');
                if (access_token && refresh_token) {
                    await this.supabase.auth.setSession({ access_token, refresh_token });
                    // Clean URL fragment
                    window.history.replaceState({}, document.title, url.pathname);
                    window.location.replace('index.html');
                    return true;
                }
            }
        } catch (e) {
            console.error('Error handling auth redirect:', e);
        }
        return false;
    }

    async checkAuthState() {
        try {
            const { data: { session } } = await this.supabase.auth.getSession();
            
            if (session && session.user) {
                // User is already authenticated, redirect to main app
                window.location.href = 'index.html';
            }
        } catch (error) {
            console.error('Error checking auth state:', error);
        }
    }

    setupEventListeners() {
        const emailInput = document.getElementById('loginEmailInput');
        const submitBtn = document.getElementById('loginSubmitBtn');
        const errorDiv = document.getElementById('loginError');

        // Submit button click
        submitBtn.addEventListener('click', () => {
            this.handleLogin();
        });

        // Enter key press
        emailInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !this.isWaiting) {
                this.handleLogin();
            }
        });

        // Clear error on input change
        emailInput.addEventListener('input', () => {
            if (!this.isWaiting) {
                this.hideError();
            }
        });
    }

    async handleLogin() {
        if (this.isWaiting) return;

        const emailInput = document.getElementById('loginEmailInput');
        const submitBtn = document.getElementById('loginSubmitBtn');
        const errorDiv = document.getElementById('loginError');
        
        const email = emailInput.value.trim();

        // Basic email validation
        if (!email || !this.isValidEmail(email)) {
            this.showError('Please enter a valid email address');
            return;
        }

        try {
            // Send magic link
            const basePath = window.location.pathname.replace(/\/[^/]*$/, '/');
            const redirectUrl = `${window.location.origin}${basePath}index.html`;
            const { error } = await this.supabase.auth.signInWithOtp({
                email: email,
                options: {
                    emailRedirectTo: redirectUrl
                }
            });

            if (error) {
                throw error;
            }

            // Success - show confirmation state first
            this.setConfirmationState();
            this.hideError();

            // After 1 second, switch to waiting state
            setTimeout(() => {
                this.setWaitingState(true);
            }, 1000);

        } catch (error) {
            console.error('Login error:', error);
            this.setWaitingState(false);
            this.showError(error.message || 'Failed to send login email. Please try again.');
        }
    }

    setConfirmationState() {
        const emailInput = document.getElementById('loginEmailInput');
        const submitBtn = document.getElementById('loginSubmitBtn');
        const icon = submitBtn.querySelector('img');

        // Update to confirmation state
        emailInput.placeholder = 'Email sent';
        emailInput.disabled = true;
        submitBtn.disabled = true;
        icon.src = './assets/images/icons/icon-check-light.png';
        icon.alt = 'Email sent';
        icon.classList.remove('loading');
    }

    setWaitingState(waiting) {
        this.isWaiting = waiting;
        
        const emailInput = document.getElementById('loginEmailInput');
        const submitBtn = document.getElementById('loginSubmitBtn');
        const icon = submitBtn.querySelector('img');

        if (waiting) {
            // Update to waiting state
            emailInput.placeholder = 'Check your mailbox';
            emailInput.disabled = true;
            submitBtn.disabled = true;
            icon.src = './assets/images/icons/icon-loading.png';
            icon.alt = 'Loading';
            icon.classList.add('loading');
            
            // Add "Check Inbox" label before the icon
            if (!submitBtn.querySelector('.check-inbox-label')) {
                const label = document.createElement('span');
                label.className = 'check-inbox-label';
                label.textContent = 'Check Inbox';
                submitBtn.insertBefore(label, icon);
            }
        } else {
            // Reset to default state
            emailInput.placeholder = 'Enter your email to log in';
            emailInput.disabled = false;
            submitBtn.disabled = false;
            icon.src = './assets/images/icons/icon-send.png';
            icon.alt = 'Send';
            icon.classList.remove('loading');
            
            // Remove "Check Inbox" label
            const label = submitBtn.querySelector('.check-inbox-label');
            if (label) {
                label.remove();
            }
        }
    }

    showError(message) {
        const errorDiv = document.getElementById('loginError');
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
    }

    hideError() {
        const errorDiv = document.getElementById('loginError');
        errorDiv.classList.add('hidden');
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
}

// Initialize the login app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new LoginApp();
});
