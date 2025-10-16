// Conversations View JavaScript
class ConversationsApp {
    constructor() {
        this.supabase = null;
        this.uploadedImageData = null;
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
    }

    setupAuth() {
        const signOutBtn = document.getElementById('signOutBtn');
        const userEmailDisplay = document.getElementById('userEmailDisplay');
        const connectionStatus = document.getElementById('connectionStatus');
        
        // Get current user and update UI
        this.supabase.auth.getSession().then(({ data }) => {
            const session = data.session;
            if (session && session.user) {
                if (userEmailDisplay) userEmailDisplay.textContent = session.user.email || 'Signed in';
                if (connectionStatus) {
                    connectionStatus.classList.remove('error', 'disconnected');
                    connectionStatus.title = 'Connected';
                }
            }
        });

        // Handle sign out
        if (signOutBtn) {
            signOutBtn.addEventListener('click', async () => {
                await this.supabase.auth.signOut();
                window.location.href = 'login.html';
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

        // Image upload button
        if (conversationsImageBtn) {
            conversationsImageBtn.addEventListener('click', () => {
                this.triggerImageUpload();
            });
        }

        // Global paste listener for images
        document.addEventListener('paste', (e) => this.handlePaste(e));
    }

    async startNewConversation() {
        const conversationsInput = document.getElementById('conversationsInput');
        const message = conversationsInput ? conversationsInput.value.trim() : '';
        
        if (!message) return;

        // Clear input
        if (conversationsInput) conversationsInput.value = '';

        // Navigate to main app with the message
        const params = new URLSearchParams();
        params.set('message', message);
        
        // Include image data if available
        if (this.uploadedImageData) {
            params.set('imageData', this.uploadedImageData.dataUrl);
            params.set('imageName', this.uploadedImageData.filename);
        }
        
        window.location.href = `index.html?${params.toString()}`;
    }

    triggerImageUpload() {
        // Create a hidden file input
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.handleImageUpload(file);
            }
        });
        
        document.body.appendChild(fileInput);
        fileInput.click();
        document.body.removeChild(fileInput);
    }

    handleImageUpload(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            this.uploadedImageData = {
                dataUrl: e.target.result,
                filename: file.name
            };
            
            // Show visual feedback
            this.showImageFeedback(file.name);
        };
        reader.readAsDataURL(file);
    }

    handlePaste(e) {
        const items = e.clipboardData.items;
        
        for (let item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                    this.handleImageUpload(file);
                }
                break;
            }
        }
    }

    showImageFeedback(filename) {
        // Create a temporary toast notification
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--accent-primary);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: slideInRight 0.3s ease-out;
        `;
        toast.textContent = `Image ready: ${filename}`;
        
        document.body.appendChild(toast);
        
        // Remove after 3 seconds
        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }
}

// Initialize the conversations app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ConversationsApp();
});
