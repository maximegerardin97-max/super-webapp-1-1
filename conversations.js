// Conversations List View
class ConversationsApp {
    constructor() {
        const cfg = (window && window.AGENT_CFG) ? window.AGENT_CFG : {};
        this.supabaseUrl = cfg.SUPABASE_URL || '';
        this.supabaseKey = cfg.SUPABASE_ANON || '';
        this.supabase = null;
        this.userSession = null;
        this.conversationsList = [];
        this.chatInputComponent = null;
        
        this.init();
    }
    
    init() {
        this.setupAuth();
        this.setupEventListeners();
        this.setupDarkModeSupport();
        this.initializeChatInput();
        this.loadConversations();
    }
    
    initializeChatInput() {
        const container = document.getElementById('chatInputContainer');
        if (container && window.ChatInputComponent) {
            this.chatInputComponent = new ChatInputComponent(container, {
                context: 'conversations',
                onComplete: (data) => this.handleChatInputComplete(data),
                onImageUpload: () => this.handleImageUpload()
            });
        }
    }
    
    handleChatInputComplete(data) {
        console.log('Chat input completed with data:', data);
        
        // Build the message from the collected data
        let message = data.initialMessage || '';
        
        if (data.productType) {
            message += ` Product type: ${data.productType}`;
        }
        if (data.industry) {
            message += `, Industry: ${data.industry}`;
        }
        if (data.improvement) {
            message += `, Improve: ${data.improvement}`;
        }
        if (data.optimization) {
            message += `, Optimize for: ${data.optimization}`;
        }
        if (data.context) {
            message += `, Context: ${data.context}`;
        }
        
        // Create new conversation and redirect to main app
        this.createConversationAndRedirect(message);
    }
    
    handleImageUpload() {
        // Redirect to main app for image upload
        this.redirectToMainApp();
    }
    
    async createConversationAndRedirect(message) {
        try {
            const conversationId = await this.createConversation(message);
            if (conversationId) {
                // Redirect to main app with conversation context
                window.location.href = `index.html?conversation=${conversationId}&message=${encodeURIComponent(message)}`;
            } else {
                // Fallback to main app
                this.redirectToMainApp();
            }
        } catch (error) {
            console.error('Error creating conversation:', error);
            this.redirectToMainApp();
        }
    }
    
    setupDarkModeSupport() {
        // Force dark mode for conversations view
        document.documentElement.setAttribute('data-theme', 'dark');
        
        // Check if the browser supports prefers-color-scheme
        if (window.matchMedia) {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            
            // Function to handle theme changes (though we're forcing dark mode)
            const handleThemeChange = (e) => {
                // Always force dark mode for conversations view
                console.log('Conversations view: forcing dark mode');
            };
            
            // Listen for theme changes
            mediaQuery.addEventListener('change', handleThemeChange);
            
            // Initial theme check
            handleThemeChange(mediaQuery);
        }
    }

    setupAuth() {
        if (!window.supabase || !this.supabaseUrl || !this.supabaseKey) {
            console.warn('Supabase auth not configured');
            return;
        }
        
        // Use singleton Supabase client
        if (!window.__SB_CLIENT__) {
            window.__SB_CLIENT__ = window.supabase.createClient(this.supabaseUrl, this.supabaseKey, {
                auth: { storageKey: 'sb-design-context-auth' }
            });
        }
        this.supabase = window.__SB_CLIENT__;
        
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
            this.userSession = data.session || null;
            updateUi(this.userSession);
        });
        
        this.supabase.auth.onAuthStateChange((event, session) => {
            this.userSession = session || null;
            updateUi(this.userSession);
            if (event === 'SIGNED_OUT') {
                // Redirect to login page when user signs out
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
                    const originalText = signInBtn.textContent;
                    signInBtn.textContent = 'Sending…';

                    const { error } = await this.supabase.auth.signInWithOtp({
                        email,
                        options: {
                            emailRedirectTo: `${window.location.origin}${window.location.pathname}`
                        }
                    });
                    if (error) throw error;

                    alert(`Magic link sent to ${email}. Check your inbox.`);
                    signInBtn.textContent = originalText;
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
        // Event listeners are now handled by the ChatInputComponent
        // No additional setup needed here
    }

    async loadConversations() {
        try {
            const conversations = await this.fetchConversationsForUser();
            this.conversationsList = Array.isArray(conversations) ? conversations : [];
            this.renderConversations();
        } catch (error) {
            console.error('Error loading conversations:', error);
            this.renderConversations(); // Render empty state
        }
    }

    async fetchConversationsForUser() {
        try {
            const authHeader = await this.getAuthHeader();
            const user = await this.getCurrentUser();
            if (!user) return [];
            
            const url = `${this.supabaseUrl}/rest/v1/conversations?select=id,title,created_at&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc`;
            const resp = await fetch(url, {
                headers: {
                    ...authHeader,
                    'apikey': this.supabaseKey
                }
            });
            if (!resp.ok) return [];
            return await resp.json();
        } catch (_) {
            return [];
        }
    }

    renderConversations() {
        const content = document.getElementById('conversationsListContent');
        if (!content) return;

        if (this.conversationsList.length === 0) {
            content.innerHTML = `
                <div class="conversations-empty">
                    <div class="empty-text">No conversations yet</div>
                    <div class="empty-subtext">Start a new conversation below</div>
                </div>
            `;
            return;
        }

        // Group conversations by date
        const byDate = {};
        for (const conversation of this.conversationsList) {
            const date = new Date(conversation.created_at);
            const dateKey = this.getDateKey(date);
            if (!byDate[dateKey]) {
                byDate[dateKey] = [];
            }
            byDate[dateKey].push(conversation);
        }

        let html = '';
        const dateOrder = ['Today', 'Yesterday'];
        
        // Add Today and Yesterday first
        for (const dateLabel of dateOrder) {
            if (byDate[dateLabel] && byDate[dateLabel].length > 0) {
                html += this.renderConversationGroup(dateLabel, byDate[dateLabel]);
                delete byDate[dateLabel];
            }
        }

        // Add remaining dates
        const remainingDates = Object.keys(byDate).sort((a, b) => {
            return new Date(byDate[b][0].created_at) - new Date(byDate[a][0].created_at);
        });

        for (const dateKey of remainingDates) {
            const dateLabel = this.formatDateKey(dateKey);
            html += this.renderConversationGroup(dateLabel, byDate[dateKey]);
        }

        content.innerHTML = html;

        // Add click listeners to conversation items
        content.addEventListener('click', (e) => {
            const conversationItem = e.target.closest('.conversation-item');
            if (conversationItem) {
                const conversationId = conversationItem.getAttribute('data-conversation-id');
                if (conversationId) {
                    this.openConversation(conversationId);
                }
            }
        });
    }

    renderConversationGroup(dateLabel, conversations) {
        let html = `
            <div class="conversation-group">
                <div class="conversation-group-header">${dateLabel}</div>
                <div class="conversation-group-items">
        `;

        for (const conversation of conversations) {
            const title = conversation.title || 'New Conversation';
            html += `
                <div class="conversation-item" data-conversation-id="${conversation.id}">
                    <div class="conversation-title">${this.escapeHtml(title)}</div>
                </div>
            `;
        }

        html += `
                </div>
            </div>
        `;

        return html;
    }

    getDateKey(date) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        
        if (dateOnly.getTime() === today.getTime()) {
            return 'Today';
        } else if (dateOnly.getTime() === yesterday.getTime()) {
            return 'Yesterday';
        } else {
            return dateOnly.toISOString().split('T')[0];
        }
    }

    formatDateKey(dateKey) {
        if (dateKey === 'Today' || dateKey === 'Yesterday') {
            return dateKey;
        }
        
        const date = new Date(dateKey);
        const day = date.getDate();
        const month = date.toLocaleDateString('en-US', { month: 'short' });
        return `${day} ${month}`;
    }


    async createConversation(title) {
        try {
            const authHeader = await this.getAuthHeader();
            const user = await this.getCurrentUser();
            if (!user) return null;

            const payload = {
                title: title || 'New Conversation',
                user_id: user.id
            };

            const resp = await fetch(`${this.supabaseUrl}/rest/v1/conversations`, {
                method: 'POST',
                headers: {
                    ...authHeader,
                    'apikey': this.supabaseKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!resp.ok) return null;
            const data = await resp.json();
            return data && data.id ? data.id : null;
        } catch (error) {
            console.error('Error creating conversation:', error);
            return null;
        }
    }

    openConversation(conversationId) {
        // Redirect to main app with conversation context
        window.location.href = `index.html?conversation=${conversationId}`;
    }

    redirectToMainApp() {
        window.location.href = 'index.html';
    }

    async getAuthHeader() {
        try {
            const session = await this.supabase.auth.getSession();
            const token = session.data?.session?.access_token;
            return token ? { 'Authorization': `Bearer ${token}` } : {};
        } catch (error) {
            console.error('Error getting auth header:', error);
            return {};
        }
    }

    async getCurrentUser() {
        try {
            const { data } = await this.supabase.auth.getUser();
            return data?.user || null;
        } catch (error) {
            console.error('Error getting current user:', error);
            return null;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the conversations app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ConversationsApp();
});
