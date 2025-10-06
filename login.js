// Login Screen JavaScript
class LoginApp {
    constructor() {
        this.supabase = null;
        this.isWaiting = false;
        this.init();
    }

    async init() {
        // Initialize Supabase client
        this.supabase = window.supabase.createClient(
            window.AGENT_CFG.SUPABASE_URL, 
            window.AGENT_CFG.SUPABASE_ANON
        );

        // Check if user is already authenticated
        await this.checkAuthState();

        // Setup event listeners
        this.setupEventListeners();
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
            const { error } = await this.supabase.auth.signInWithOtp({
                email: email,
                options: {
                    emailRedirectTo: `${window.location.origin}/index.html`
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
        } else {
            // Reset to default state
            emailInput.placeholder = 'Enter your email to log in';
            emailInput.disabled = false;
            submitBtn.disabled = false;
            icon.src = './assets/images/icons/icon-send.png';
            icon.alt = 'Send';
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
