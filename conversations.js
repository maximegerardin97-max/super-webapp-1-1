// Conversations List View JavaScript
class ConversationsApp {
    constructor() {
        this.supabase = null;
        this.conversationsList = [];
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

        // Setup auth UI
        this.setupAuth();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Load conversations
        await this.loadConversations();
    }

    setupAuth() {
        const emailInput = document.getElementById('authEmail');
        const signInBtn = document.getElementById('signInBtn');
        const signOutBtn = document.getElementById('signOutBtn');
        const authStateSignedOut = document.getElementById('authStateSignedOut');
        const authStateSignedIn = document.getElementById('authStateSignedIn');
        const userEmailDisplay = document.getElementById('userEmailDisplay');
        const connectionStatus = document.getElementById('connectionStatus');
        
        const updateUi = (session) => {
            const user = session && session.user ? session.user : null;
            if (user) {
                // Show signed in state
                if (authStateSignedOut) authStateSignedOut.classList.add('hidden');
                if (authStateSignedIn) authStateSignedIn.classList.remove('hidden');
                if (userEmailDisplay) userEmailDisplay.textContent = user.email || 'Signed in';
                // Update connection status to connected
                if (connectionStatus) {
                    connectionStatus.classList.remove('error', 'disconnected');
                    connectionStatus.title = 'Connected';
                }
            } else {
                // Show signed out state
                if (authStateSignedOut) authStateSignedOut.classList.remove('hidden');
                if (authStateSignedIn) authStateSignedIn.classList.add('hidden');
                // Update connection status to disconnected
                if (connectionStatus) {
                    connectionStatus.classList.add('disconnected');
                    connectionStatus.classList.remove('error');
                    connectionStatus.title = 'Not connected';
                }
            }
        };

        this.supabase.auth.getSession().then(({ data }) => {
            updateUi(data.session);
        });

        this.supabase.auth.onAuthStateChange((event, session) => {
            updateUi(session);
            if (event === 'SIGNED_OUT') {
                window.location.href = 'login.html';
            }
        });

        if (signInBtn) {
            signInBtn.addEventListener('click', async () => {
                const email = emailInput && emailInput.value ? emailInput.value.trim() : '';
                const valid = /.+@.+\..+/.test(email);
                if (!valid) {
                    alert('Please enter a valid email address');
                    return;
                }
                try {
                    signInBtn.disabled = true;
                    signInBtn.textContent = 'Sending…';

                    const { error } = await this.supabase.auth.signInWithOtp({
                        email,
                        options: {
                            emailRedirectTo: `${window.location.origin}${window.location.pathname}`
                        }
                    });
                    if (error) throw error;

                    alert(`Magic link sent to ${email}. Check your inbox.`);
                    signInBtn.textContent = 'Sign in';
                    signInBtn.disabled = false;
                } catch (e) {
                    console.error(e);
                    alert('Sign-in failed: ' + (e && e.message ? e.message : String(e)));
                    signInBtn.disabled = false;
                    signInBtn.textContent = 'Sign in';
                }
            });
        }

        if (signOutBtn) {
            signOutBtn.addEventListener('click', async () => {
                await this.supabase.auth.signOut();
            });
        }
    }

    setupEventListeners() {
        const conversationsInput = document.getElementById('conversationsInput');
        const conversationsSendBtn = document.getElementById('conversationsSendBtn');
        const conversationsImageBtn = document.getElementById('conversationsImageBtn');

        // Send button click
        if (conversationsSendBtn) {
            conversationsSendBtn.addEventListener('click', () => {
                this.startNewConversation();
            });
        }

        // Enter key press
        if (conversationsInput) {
            conversationsInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.startNewConversation();
                }
            });
        }

        // Image button click (placeholder for future functionality)
        if (conversationsImageBtn) {
            conversationsImageBtn.addEventListener('click', () => {
                // TODO: Handle image upload for new conversation
                console.log('Image upload for new conversation');
            });
        }
    }

    async loadConversations() {
        const conversationsList = document.getElementById('conversationsList');
        if (!conversationsList) return;

        try {
            // Show loading state
            conversationsList.innerHTML = '<div class="conversations-loading">Loading conversations...</div>';

            // Fetch conversations
            const conversations = await this.fetchConversationsForUser();
            this.conversationsList = Array.isArray(conversations) ? conversations : [];

            // Render conversations
            this.renderConversations();
        } catch (error) {
            console.error('Error loading conversations:', error);
            conversationsList.innerHTML = '<div class="conversations-loading">Error loading conversations</div>';
        }
    }

    async fetchConversationsForUser() {
        try {
            const authHeader = await this.getAuthHeader();
            const user = await this.getCurrentUser();
            if (!user) return [];
            
            const url = `${window.AGENT_CFG.SUPABASE_URL}/rest/v1/conversations?select=id,title,created_at&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc`;
            const resp = await fetch(url, {
                headers: { ...authHeader, 'Content-Type': 'application/json' }
            });
            if (!resp.ok) return [];
            return await resp.json();
        } catch (_) { return []; }
    }

    renderConversations() {
        const conversationsList = document.getElementById('conversationsList');
        if (!conversationsList) return;

        if (this.conversationsList.length === 0) {
            conversationsList.innerHTML = '<div class="conversations-loading">No conversations yet</div>';
            return;
        }

        // Group conversations by date
        const byDate = {};
        for (const c of this.conversationsList) {
            const d = new Date(c.created_at);
            const key = this.formatDateGroup(d);
            if (!byDate[key]) byDate[key] = [];
            byDate[key].push(c);
        }

        // Render grouped conversations
        let html = '';
        const dateOrder = ['Today', 'Yesterday'];
        
        // Add specific date groups first
        for (const dateKey of dateOrder) {
            if (byDate[dateKey]) {
                html += `<div class="conversations-date-group">
                    <div class="conversations-date-label">${dateKey}</div>
                    <div class="conversations-date-items">`;
                
                for (const conv of byDate[dateKey]) {
                    html += this.renderConversationItem(conv);
                }
                
                html += '</div></div>';
                delete byDate[dateKey];
            }
        }

        // Add remaining dates
        for (const [dateKey, conversations] of Object.entries(byDate)) {
            html += `<div class="conversations-date-group">
                <div class="conversations-date-label">${dateKey}</div>
                <div class="conversations-date-items">`;
            
            for (const conv of conversations) {
                html += this.renderConversationItem(conv);
            }
            
            html += '</div></div>';
        }

        conversationsList.innerHTML = html;

        // Add click handlers
        conversationsList.querySelectorAll('.conversation-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.getAttribute('data-id');
                this.openConversation(id);
            });
        });
    }

    renderConversationItem(conversation) {
        const title = conversation.title || 'Untitled Conversation';
        return `
            <div class="conversation-item" data-id="${conversation.id}">
                <span class="conversation-title">${title}</span>
            </div>
        `;
    }

    formatDateGroup(date) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        const convDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        if (convDate.getTime() === today.getTime()) return 'Today';
        if (convDate.getTime() === yesterday.getTime()) return 'Yesterday';
        
        return date.toLocaleDateString('en-US', { 
            day: 'numeric', 
            month: 'short' 
        });
    }

    openConversation(conversationId) {
        // Navigate to main app with conversation ID
        window.location.href = `index.html?conversation=${conversationId}`;
    }

    startNewConversation() {
        const input = document.getElementById('conversationsInput');
        const message = input ? input.value.trim() : '';
        
        if (message) {
            // Navigate to main app with the message
            const encodedMessage = encodeURIComponent(message);
            window.location.href = `index.html?message=${encodedMessage}`;
        } else {
            // Navigate to main app without message
            window.location.href = 'index.html';
        }
    }

    async getAuthHeader() {
        const { data: { session } } = await this.supabase.auth.getSession();
        return session ? { Authorization: `Bearer ${session.access_token}` } : {};
    }

    async getCurrentUser() {
        const { data: { user } } = await this.supabase.auth.getUser();
        return user;
    }
}

// Initialize the conversations app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ConversationsApp();
});
