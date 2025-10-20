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
        this.loadConversations();
    }
    
    handleNewConversation() {
        // Redirect to main app to start a new conversation
        window.location.href = 'index.html';
    }
    
    
    async createConversationAndRedirect(message, imageData = null) {
        try {
            const conversationId = await this.createConversation(message);
            if (conversationId) {
                // Send the message to the agent to start the conversation
                await this.sendMessageToAgent(conversationId, message, imageData);
                
                // Build redirect URL with only conversation ID (message is now in the conversation)
                let redirectUrl = `index.html?conversation=${conversationId}`;
                
                // If there's image data, store it for the main app to display
                if (imageData) {
                    sessionStorage.setItem('pendingImageData', JSON.stringify(imageData));
                    redirectUrl += '&hasImage=true';
                }
                
                // Redirect to main app with conversation context
                window.location.href = redirectUrl;
            } else {
                // Fallback to main app
                this.redirectToMainApp();
            }
        } catch (error) {
            console.error('Error creating conversation:', error);
            this.redirectToMainApp();
        }
    }
    
    async sendMessageToAgent(conversationId, message, imageData = null) {
        try {
            const authHeader = await this.getAuthHeader();
            const user = await this.getCurrentUser();
            if (!user) return;

            // Prepare the message payload
            const messagePayload = {
                conversation_id: conversationId,
                user_id: user.id,
                content: message,
                role: 'user',
                created_at: new Date().toISOString()
            };

            // Add image data if available
            if (imageData) {
                messagePayload.image_data = imageData;
            }

            // Insert the user message into the conversation
            const messageResp = await fetch(`${this.supabaseUrl}/rest/v1/messages`, {
                method: 'POST',
                headers: {
                    ...authHeader,
                    'apikey': this.supabaseKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(messagePayload)
            });

            if (!messageResp.ok) {
                console.error('Failed to add message to conversation');
                return;
            }

            // Now send to the agent for processing
            await this.triggerAgentResponse(conversationId, message, imageData);
            
        } catch (error) {
            console.error('Error sending message to agent:', error);
        }
    }
    
    async triggerAgentResponse(conversationId, message, imageData = null) {
        try {
            const authHeader = await this.getAuthHeader();
            
            // Prepare the agent request payload
            const agentPayload = {
                conversation_id: conversationId,
                message: message,
                imageData: imageData
            };

            // Send to the agent endpoint
            const agentResp = await fetch(`${this.supabaseUrl}/functions/v1/llm-proxy-auth`, {
                method: 'POST',
                headers: {
                    ...authHeader,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(agentPayload)
            });

            if (!agentResp.ok) {
                console.error('Failed to get agent response');
            }
            
        } catch (error) {
            console.error('Error triggering agent response:', error);
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
        // New conversation button
        const newConversationBtn = document.getElementById('newConversationBtn');
        if (newConversationBtn) {
            newConversationBtn.addEventListener('click', () => {
                this.handleNewConversation();
            });
        }
        
        
        // Conversation item clicks and delete buttons
        this.setupConversationItemListeners();
    }
    
    setupConversationItemListeners() {
        const content = document.getElementById('conversationsListContent');
        if (!content) return;
        
        // Handle conversation item clicks (open conversation)
        content.addEventListener('click', (e) => {
            const conversationItem = e.target.closest('.conversation-item');
            const deleteBtn = e.target.closest('.conversation-delete-btn');
            const renameBtn = e.target.closest('.conversation-rename-btn');
            const titleEdit = e.target.closest('.conversation-title-edit');
            const titleContainer = e.target.closest('.conversation-title-container');
            
            if (deleteBtn) {
                // Handle delete button click
                e.stopPropagation();
                const conversationId = deleteBtn.getAttribute('data-conversation-id');
                this.handleDeleteConversation(conversationId);
            } else if (renameBtn) {
                // Handle rename button click
                e.stopPropagation();
                const conversationId = renameBtn.getAttribute('data-conversation-id');
                
                if (renameBtn.classList.contains('confirm-mode')) {
                    // If in confirm mode, save the title
                    const editElement = document.querySelector(`.conversation-title-edit[data-conversation-id="${conversationId}"]`);
                    if (editElement) {
                        this.saveConversationTitle(conversationId, editElement.value);
                    }
                } else {
                    // If in edit mode, start editing
                    this.handleRenameConversation(conversationId);
                }
            } else if (titleEdit || titleContainer) {
                // Handle title edit input or container click (don't open conversation)
                e.stopPropagation();
            } else if (conversationItem) {
                // Handle conversation item click (open conversation)
                const conversationId = conversationItem.getAttribute('data-conversation-id');
                this.openConversation(conversationId);
            }
        });
        
        // Handle title edit input events
        content.addEventListener('keydown', (e) => {
            if (e.target.classList.contains('conversation-title-edit')) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const conversationId = e.target.getAttribute('data-conversation-id');
                    this.saveConversationTitle(conversationId, e.target.value);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.cancelRenameConversation(e.target.getAttribute('data-conversation-id'));
                }
            }
        });
        
        // Handle title edit blur (click outside)
        content.addEventListener('blur', (e) => {
            if (e.target.classList.contains('conversation-title-edit')) {
                const conversationId = e.target.getAttribute('data-conversation-id');
                this.saveConversationTitle(conversationId, e.target.value);
            }
        }, true);
    }
    
    openConversation(conversationId) {
        // Redirect to main app with the conversation
        window.location.href = `index.html?conversation=${conversationId}`;
    }
    
    async handleDeleteConversation(conversationId) {
        // Show confirmation dialog
        const confirmed = confirm('Are you sure you want to delete this conversation? This action cannot be undone.');
        if (!confirmed) return;
        
        try {
            await this.deleteConversation(conversationId);
            // Refresh the conversations list
            await this.loadConversations();
        } catch (error) {
            console.error('Error deleting conversation:', error);
            alert('Failed to delete conversation. Please try again.');
        }
    }
    
    handleRenameConversation(conversationId) {
        const titleElement = document.querySelector(`.conversation-title[data-conversation-id="${conversationId}"]`);
        const editElement = document.querySelector(`.conversation-title-edit[data-conversation-id="${conversationId}"]`);
        const renameBtn = document.querySelector(`.conversation-rename-btn[data-conversation-id="${conversationId}"]`);
        
        if (!titleElement || !editElement || !renameBtn) return;
        
        // Hide title, show edit input
        titleElement.classList.add('hidden');
        editElement.classList.remove('hidden');
        editElement.focus();
        editElement.select();
        
        // Change edit button to confirmation button
        const img = renameBtn.querySelector('img');
        img.src = './assets/images/icons/icon-check-light.png';
        img.alt = 'Confirm';
        renameBtn.title = 'Confirm rename';
        renameBtn.classList.add('confirm-mode');
    }
    
    async saveConversationTitle(conversationId, newTitle) {
        if (!newTitle || newTitle.trim() === '') {
            this.cancelRenameConversation(conversationId);
            return;
        }
        
        try {
            await this.updateConversationTitle(conversationId, newTitle.trim());
            
            // Update the UI
            const titleElement = document.querySelector(`.conversation-title[data-conversation-id="${conversationId}"]`);
            const editElement = document.querySelector(`.conversation-title-edit[data-conversation-id="${conversationId}"]`);
            const renameBtn = document.querySelector(`.conversation-rename-btn[data-conversation-id="${conversationId}"]`);
            
            if (titleElement && editElement) {
                titleElement.textContent = newTitle.trim();
                titleElement.classList.remove('hidden');
                editElement.classList.add('hidden');
            }
            
            if (renameBtn) {
                // Reset button back to edit mode
                const img = renameBtn.querySelector('img');
                img.src = './assets/images/icons/icon-edit-wht.png';
                img.alt = 'Rename';
                renameBtn.title = 'Rename conversation';
                renameBtn.classList.remove('confirm-mode');
            }
        } catch (error) {
            console.error('Error updating conversation title:', error);
            alert('Failed to update conversation title. Please try again.');
            this.cancelRenameConversation(conversationId);
        }
    }
    
    cancelRenameConversation(conversationId) {
        const titleElement = document.querySelector(`.conversation-title[data-conversation-id="${conversationId}"]`);
        const editElement = document.querySelector(`.conversation-title-edit[data-conversation-id="${conversationId}"]`);
        const renameBtn = document.querySelector(`.conversation-rename-btn[data-conversation-id="${conversationId}"]`);
        
        if (titleElement && editElement) {
            // Reset edit input to original title
            editElement.value = titleElement.textContent;
            titleElement.classList.remove('hidden');
            editElement.classList.add('hidden');
        }
        
        if (renameBtn) {
            // Reset button back to edit mode
            const img = renameBtn.querySelector('img');
            img.src = './assets/images/icons/icon-edit-wht.png';
            img.alt = 'Rename';
            renameBtn.title = 'Rename conversation';
            renameBtn.classList.remove('confirm-mode');
        }
    }
    
    async updateConversationTitle(conversationId, newTitle) {
        const authHeader = await this.getAuthHeader();
        const user = await this.getCurrentUser();
        if (!user) throw new Error('User not authenticated');
        
        const payload = {
            title: newTitle
        };
        
        const resp = await fetch(`${this.supabaseUrl}/rest/v1/conversations?id=eq.${encodeURIComponent(conversationId)}`, {
            method: 'PATCH',
            headers: {
                ...authHeader,
                'apikey': this.supabaseKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (!resp.ok) {
            const errorText = await resp.text();
            throw new Error(`Failed to update conversation: ${resp.status} ${resp.statusText} - ${errorText}`);
        }
        
        // Handle 204 No Content response (successful update with no content)
        if (resp.status === 204) {
            return { success: true };
        }
        
        // For other successful responses, try to parse JSON
        return await resp.json();
    }
    
    async deleteConversation(conversationId) {
        const authHeader = await this.getAuthHeader();
        const user = await this.getCurrentUser();
        if (!user) throw new Error('User not authenticated');
        
        // First, delete all messages in the conversation
        const messagesResp = await fetch(`${this.supabaseUrl}/rest/v1/messages?conversation_id=eq.${encodeURIComponent(conversationId)}`, {
            method: 'DELETE',
            headers: {
                ...authHeader,
                'apikey': this.supabaseKey
            }
        });
        
        if (!messagesResp.ok) {
            console.error('Failed to delete messages');
        }
        
        // Then, delete the conversation itself
        const conversationResp = await fetch(`${this.supabaseUrl}/rest/v1/conversations?id=eq.${encodeURIComponent(conversationId)}`, {
            method: 'DELETE',
            headers: {
                ...authHeader,
                'apikey': this.supabaseKey
            }
        });
        
        if (!conversationResp.ok) {
            throw new Error('Failed to delete conversation');
        }
        
        console.log('Conversation deleted successfully');
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
                    <div class="conversation-title-container">
                        <div class="conversation-title" data-conversation-id="${conversation.id}">${this.escapeHtml(title)}</div>
                        <input class="conversation-title-edit hidden" data-conversation-id="${conversation.id}" value="${this.escapeHtml(title)}" />
                    </div>
                    <div class="conversation-actions">
                        <button class="conversation-rename-btn" data-conversation-id="${conversation.id}" title="Rename conversation">
                            <img src="./assets/images/icons/icon-edit-wht.png" alt="Rename" class="auth-icon-img" />
                        </button>
                        <button class="conversation-delete-btn" data-conversation-id="${conversation.id}" title="Delete conversation">
                            <img src="./assets/images/icons/icon-trash-wht.png" alt="Delete" class="auth-icon-img" />
                        </button>
                    </div>
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
