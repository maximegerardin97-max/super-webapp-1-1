// Login Screen JavaScript

// Initialize Supabase client
const supabase = window.supabase.createClient(window.AGENT_CFG.SUPABASE_URL, window.AGENT_CFG.SUPABASE_ANON);

// DOM elements
const authEmailInput = document.getElementById('authEmail');
const signInBtn = document.getElementById('signInBtn');
const authStateSignedOut = document.getElementById('authStateSignedOut');
const authStateSignedIn = document.getElementById('authStateSignedIn');
const userEmailDisplay = document.getElementById('userEmailDisplay');
const signOutBtn = document.getElementById('signOutBtn');

// Initialize login screen
document.addEventListener('DOMContentLoaded', function() {
    checkAuthState();
    setupEventListeners();
});

// Check authentication state
async function checkAuthState() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session && session.user) {
            showSignedInState(session.user.email);
        } else {
            showSignedOutState();
        }
    } catch (error) {
        console.error('Error checking auth state:', error);
        showSignedOutState();
    }
}

// Show signed out state
function showSignedOutState() {
    authStateSignedOut.classList.remove('hidden');
    authStateSignedIn.classList.add('hidden');
    authEmailInput.value = '';
    authEmailInput.focus();
}

// Show signed in state
function showSignedInState(email) {
    authStateSignedOut.classList.add('hidden');
    authStateSignedIn.classList.remove('hidden');
    userEmailDisplay.textContent = email;
    
    // Redirect to main app after a short delay
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 1000);
}

// Setup event listeners
function setupEventListeners() {
    // Sign in button click
    signInBtn.addEventListener('click', handleSignIn);
    
    // Enter key on email input
    authEmailInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleSignIn();
        }
    });
    
    // Sign out button click
    if (signOutBtn) {
        signOutBtn.addEventListener('click', handleSignOut);
    }
    
    // Listen for auth state changes
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            showSignedInState(session.user.email);
        } else if (event === 'SIGNED_OUT') {
            showSignedOutState();
        }
    });
}

// Handle sign in
async function handleSignIn() {
    const email = authEmailInput.value.trim();
    
    if (!email) {
        authEmailInput.focus();
        return;
    }
    
    if (!isValidEmail(email)) {
        alert('Please enter a valid email address');
        authEmailInput.focus();
        return;
    }
    
    try {
        // Disable the button and show loading state
        signInBtn.disabled = true;
        signInBtn.style.opacity = '0.5';
        
        // Send magic link
        const { error } = await supabase.auth.signInWithOtp({
            email: email,
            options: {
                emailRedirectTo: window.location.origin + '/index.html'
            }
        });
        
        if (error) {
            throw error;
        }
        
        // Show success message
        showMessage('Check your mailbox for the login link!');
        
        // Update UI to show waiting state
        authEmailInput.placeholder = 'Check your mailbox';
        authEmailInput.value = '';
        authEmailInput.disabled = true;
        
    } catch (error) {
        console.error('Sign in error:', error);
        alert('Failed to send login link. Please try again.');
    } finally {
        // Re-enable the button
        signInBtn.disabled = false;
        signInBtn.style.opacity = '1';
    }
}

// Handle sign out
async function handleSignOut() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) {
            throw error;
        }
        showSignedOutState();
    } catch (error) {
        console.error('Sign out error:', error);
        alert('Failed to sign out. Please try again.');
    }
}

// Validate email format
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Show message to user
function showMessage(message) {
    // Create a temporary message element
    const messageEl = document.createElement('div');
    messageEl.textContent = message;
    messageEl.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--bg-secondary);
        color: var(--text-primary);
        padding: 12px 24px;
        border-radius: 24px;
        box-shadow: 0 6px 20px var(--shadow-primary);
        z-index: 1000;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.3s ease;
    `;
    
    document.body.appendChild(messageEl);
    
    // Remove after 3 seconds
    setTimeout(() => {
        messageEl.style.opacity = '0';
        messageEl.style.transform = 'translateX(-50%) translateY(-20px)';
        setTimeout(() => {
            document.body.removeChild(messageEl);
        }, 300);
    }, 3000);
}
