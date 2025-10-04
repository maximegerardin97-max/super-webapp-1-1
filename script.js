// Simple Design Rating App
const COMMAND_RE = /command\s*:?\s*send\s+([a-z0-9]+)\s+(.+)/i;

// ------------------------------------------------------------
// Simplified frontend - backend handles all mapping now
// ------------------------------------------------------------

// Backend now handles all mapping - no need for frontend mapping

// Small synonyms pass to make it more tolerant

class DesignRatingApp {
    constructor() {
        const cfg = (window && window.AGENT_CFG) ? window.AGENT_CFG : {};
        this.supabaseUrl = cfg.SUPABASE_URL || '';
        this.supabaseKey = cfg.SUPABASE_ANON || '';
        this.chatUrl = cfg.CHAT_URL || '';
        this.supabase = null;
        this.userSession = null;
        this.uploadedImages = [];
        this.isProcessing = false;
        
        // Conversation context management
        this.conversationHistory = new Map(); // cardId -> conversation history
        this.currentConversationId = null; // Current active conversation
        this.conversationsList = [];
        this.userDesignsByConversation = new Map();
        this.mainChatHistory = []; // Centralized main chat history
        this.chatMemory = []; // last 10 turns (20 messages)

        // Shared settings from LLM Proxy
        this.currentProvider = null;
        this.currentModel = null;
        this.currentSystemPrompt = null;
        
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupDarkModeSupport(); // Setup dark mode support
        this.setupLargeImageDisplay(); // Setup large image display
        this.setupChatStates(); // Setup chat states
        this.setupAuth(); // Setup Supabase auth
        // Load shared settings on start
        this.loadSharedSettings().then((s) => {
            if (s) {
                this.currentProvider = s.provider;
                this.currentModel = s.model;
                this.currentSystemPrompt = s.systemPrompt;
            }
        }).catch(console.error);
        // Refresh settings when window regains focus
        window.addEventListener('focus', () => {
            this.loadSharedSettings().then((s) => {
                if (s) {
                    this.currentProvider = s.provider;
                    this.currentModel = s.model;
                    this.currentSystemPrompt = s.systemPrompt;
                }
            }).catch(console.error);
        });
    }

    setupAuth() {
        if (!window.supabase || !this.supabaseUrl || !this.supabaseKey) {
            console.warn('Supabase auth not configured');
            return;
        }
        this.supabase = window.supabase.createClient(this.supabaseUrl, this.supabaseKey);
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
            if (this.userSession) { this.ensureProfile().catch(()=>{}); }
        });
        this.supabase.auth.onAuthStateChange((_event, session) => {
            this.userSession = session || null;
            updateUi(this.userSession);
            if (this.userSession) { this.ensureProfile().catch(()=>{}); }
        });
        if (signInBtn) {
            signInBtn.addEventListener('click', async () => {
                const email = emailInput && emailInput.value ? emailInput.value.trim() : '';
                // Very basic email validation
                const valid = /.+@.+\..+/.test(email);
                if (!valid) {
                    alert('Please enter a valid email address');
                    return;
                }
                try {
                    // UI: disable and show progress
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
                    // restore button
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
        // Handle magic link callback if present
        const hash = window.location.hash || '';
        if (hash.includes('access_token') && hash.includes('type=recovery') === false) {
            // Supabase JS v2 will handle session from URL by default; ensure UI updates after initial getSession
            this.supabase.auth.getSession().then(({ data }) => {
                this.userSession = data.session || null;
                updateUi(this.userSession);
            });
        }
    }

    // Update connection status indicator
    updateConnectionStatus(status = 'connected') {
        const connectionStatus = document.getElementById('connectionStatus');
        if (!connectionStatus) return;
        
        connectionStatus.classList.remove('error', 'disconnected');
        
        switch(status) {
            case 'connected':
                connectionStatus.title = 'Connected';
                break;
            case 'error':
                connectionStatus.classList.add('error');
                connectionStatus.title = 'Connection error';
                break;
            case 'disconnected':
                connectionStatus.classList.add('disconnected');
                connectionStatus.title = 'Not connected';
                break;
        }
    }

    setupDarkModeSupport() {
        // Check if the browser supports prefers-color-scheme
        if (window.matchMedia) {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            
            // Function to handle theme changes
            const handleThemeChange = (e) => {
                // The CSS custom properties will automatically update based on the media query
                // This function can be used for any additional JavaScript-based theme handling
                console.log('Theme changed to:', e.matches ? 'dark' : 'light');
            };
            
            // Listen for theme changes
            mediaQuery.addEventListener('change', handleThemeChange);
            
            // Initial theme check
            handleThemeChange(mediaQuery);
        }
    }

    setupLargeImageDisplay() {
        const largeImageDisplay = document.getElementById('largeImageDisplay');
        const largeImageUpload = document.getElementById('largeImageUpload');
        const largeImagePlaceholder = document.querySelector('.large-image-placeholder');
        const largeUploadIcon = document.querySelector('.upload-icon-large');
        const largeImageContent = document.getElementById('largeImageContent');
        const largeImage = document.getElementById('largeImage');
        const removeLargeImage = document.getElementById('removeLargeImage');
        const addToChatLarge = document.getElementById('addToChatLarge');

        // Click to upload (bind to multiple elements for robustness)
        if (largeImagePlaceholder) {
            largeImagePlaceholder.addEventListener('click', () => largeImageUpload && largeImageUpload.click());
        }
        if (largeUploadIcon) {
            largeUploadIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                largeImageUpload && largeImageUpload.click();
            });
        }
        if (largeImageDisplay) {
            largeImageDisplay.addEventListener('click', (e) => {
                // Only trigger when no image is present
                const hasImage = largeImageContent && !largeImageContent.classList.contains('hidden');
                if (!hasImage) {
                    largeImageUpload && largeImageUpload.click();
                }
            });
        }

        // File input change
        largeImageUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.handleLargeImageUpload(file);
            }
        });

        // Drag and drop
        largeImageDisplay.addEventListener('dragover', (e) => {
            e.preventDefault();
            largeImageDisplay.classList.add('drag-over');
        });

        largeImageDisplay.addEventListener('dragleave', (e) => {
            e.preventDefault();
            largeImageDisplay.classList.remove('drag-over');
        });

        largeImageDisplay.addEventListener('drop', (e) => {
            e.preventDefault();
            largeImageDisplay.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                this.handleLargeImageUpload(file);
            }
        });

        // Remove image
        removeLargeImage.addEventListener('click', () => {
            this.removeLargeImage();
        });

        // Add to chat
        addToChatLarge.addEventListener('click', () => {
            const imageSrc = largeImage.src;
            if (imageSrc) {
                this.addImageToMainChat(imageSrc, 'Uploaded design');
            }
        });

    }

    handleLargeImageUpload(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const imageDataUrl = e.target.result;
            this.displayLargeImage(imageDataUrl, file.name);
            
            // Store the image data for use in the analysis
            this.uploadedImageData = {
                dataUrl: imageDataUrl,
                filename: file.name
            };
            // Persist user's design for restore
            this.userDesignImageData = { ...this.uploadedImageData };
            
            // Automatically move to step 2 when image is uploaded
            this.goToStep(2);
            
        };
        reader.readAsDataURL(file);
    }

    displayLargeImage(imageDataUrl, filename) {
        const largeImagePlaceholder = document.querySelector('.large-image-placeholder');
        const largeImageContent = document.getElementById('largeImageContent');
        const largeImage = document.getElementById('largeImage');
        const largeImageDisplay = document.getElementById('largeImageDisplay');
        const largeImageContainer = document.querySelector('.large-image-container');

        // Hide placeholder and show image
        largeImagePlaceholder.classList.add('hidden');
        largeImageContent.classList.remove('hidden');
        
        // Add classes to indicate image is loaded
        largeImageDisplay.classList.add('has-image');
        largeImageContainer.classList.add('has-image');
        
        // Set image source
        largeImage.src = imageDataUrl;
        largeImage.alt = filename;
    }


    removeLargeImage() {
        const largeImagePlaceholder = document.querySelector('.large-image-placeholder');
        const largeImageContent = document.getElementById('largeImageContent');
        const largeImage = document.getElementById('largeImage');
        const largeImageUpload = document.getElementById('largeImageUpload');
        const largeImageDisplay = document.getElementById('largeImageDisplay');
        const largeImageContainer = document.querySelector('.large-image-container');

        // Show placeholder and hide image
        largeImagePlaceholder.classList.remove('hidden');
        largeImageContent.classList.add('hidden');
        
        // Remove classes that indicate image is loaded
        largeImageDisplay.classList.remove('has-image');
        largeImageContainer.classList.remove('has-image');
        
        // Clear image source
        largeImage.src = '';
        largeImage.alt = '';
        
        // Clear file input
        largeImageUpload.value = '';
        
    }

    // Check if message contains COMMAND formula
    containsCommandFormula(message) {
        return message.includes('COMMAND: send ');
    }

    // Parse structured response to extract Solutions and Arguments
    parseStructuredResponse(message) {
        const result = {
            hasStructured: false,
            introText: '',
            solutions: [],
            arguments: []
        };

        // Check if message contains Solutions (starting with ✅)
        const solutionMatches = message.match(/✅\s*([^\n]+)/g);
        if (solutionMatches) {
            result.hasStructured = true;
            result.solutions = solutionMatches.map(match => 
                match.replace(/✅\s*/, '').trim()
            );
        }

        // Check if message contains Arguments (starting with 🟢 or 🔴)
        const argumentMatches = message.match(/(🟢|🔴)\s*([^\n]+)/g);
        if (argumentMatches) {
            result.hasStructured = true;
            result.arguments = argumentMatches.map(match => {
                const isPositive = match.startsWith('🟢');
                const text = match.replace(/(🟢|🔴)\s*/, '').trim();
                return { text, isPositive };
            });
        }

        // Extract intro text (everything before the first structured element)
        if (result.hasStructured) {
            const firstStructuredIndex = message.search(/(✅|🟢|🔴)/);
            if (firstStructuredIndex > 0) {
                result.introText = message.substring(0, firstStructuredIndex).trim();
            }
        }

        return result;
    }

    // Display structured response with Solutions and Arguments cards
    displayStructuredResponse(structuredContent, chatResultsContent) {
        // Create main message container
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message assistant-message';

        let html = '';

        // Add intro text if present
        if (structuredContent.introText) {
            html += `<div class="message-content">${structuredContent.introText}</div>`;
        }

        // Add Solutions card if present
        if (structuredContent.solutions.length > 0) {
            html += this.createSolutionsCard(structuredContent.solutions);
        }

        // Add Arguments card if present
        if (structuredContent.arguments.length > 0) {
            html += this.createArgumentsCard(structuredContent.arguments);
        }

        // Add timestamp
        html += `<div class="message-time">${new Date().toLocaleTimeString()}</div>`;

        messageDiv.innerHTML = html;
        chatResultsContent.appendChild(messageDiv);
        chatResultsContent.scrollTop = chatResultsContent.scrollHeight;
    }

    // Create Solutions card HTML
    createSolutionsCard(solutions) {
        const solutionsList = solutions.map((solution, index) => {
            const safe = solution.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `
                <div class="solution-item">
                    <div class="solution-number">${index + 1}</div>
                    <div class="solution-text">${safe}</div>
                    <button class="solution-more-btn" data-solution-index="${index}">More</button>
                </div>
            `;
        }).join('');

        return `
            <div class="solutions-card">
                <div class="solutions-card-title">Solutions</div>
                <div class="solutions-list">
                    ${solutionsList}
                </div>
            </div>
        `;
    }

    // Create Arguments card HTML
    createArgumentsCard(argsList) {
        const argumentsList = argsList.map(arg => `
            <div class="argument-item ${arg.isPositive ? 'positive' : 'negative'}">
                <div class="argument-indicator">${arg.isPositive ? '🟢' : '🔴'}</div>
                <div class="argument-text">${arg.text}</div>
            </div>
        `).join('');

        return `
            <div class="arguments-card" id="argumentsCard">
                <div class="arguments-card-header">
                    <div class="arguments-card-title">Arguments</div>
                    <span class="arguments-card-toggle">▼</span>
                </div>
                <div class="arguments-card-content">
                    <div class="arguments-list">
                        ${argumentsList}
                    </div>
                </div>
            </div>
        `;
    }

    // Parse the requested Screen Analysis card layout from JSON
    parseScreenAnalysis(message) {
        const result = {
            hasScreenAnalysis: false,
            summary: '',
            recommendations: [],
            flowInspiration: null,
            commandLine: '',
            punchline: '',
            showDesignsLabel: 'Show designs'
        };

        try {
            // Try multiple JSON extraction patterns
            let jsonData = null;
            let jsonMatch = null;
            
            // Pattern 1: Full message is JSON
            try {
                jsonData = JSON.parse(message.trim());
                jsonMatch = [message.trim()];
                console.log('Full message is JSON');
            } catch (e) {
                // Pattern 2: JSON embedded in text
                jsonMatch = message.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    jsonData = JSON.parse(jsonMatch[0]);
                    console.log('Found embedded JSON');
                }
            }
            
            if (!jsonData) {
                console.log('No valid JSON found in message:', message.substring(0, 200));
                return result;
            }

            console.log('Parsed JSON data:', jsonData);
            console.log('JSON keys:', Object.keys(jsonData));
            
            // Check for different possible response formats
            if (jsonData.summary || jsonData.recommendations || jsonData.response || jsonData.content || jsonData.message) {
                this.populateResultFromJson(jsonData, result);
                this.extractCommandAndPunchline(message, result);
                result.hasScreenAnalysis = true;
                console.log('Successfully parsed as screen analysis');
            } else {
                console.log('JSON does not contain expected fields (summary, recommendations, response, content, message)');
                console.log('Available fields:', Object.keys(jsonData));
            }
        } catch (error) {
            console.error('Failed to parse design recommendations:', error);
            console.log('Raw message that failed to parse:', message.substring(0, 500));
            // Show error toast if available
            if (typeof this.showToast === 'function') {
                this.showToast('Couldn\'t parse design response. Retry.', 'error');
            }
        }

        return result;
    }

    // Helper method to populate result from JSON data
    populateResultFromJson(jsonData, result) {
        // Handle different response formats
        if (jsonData.summary) {
            result.summary = jsonData.summary;
        } else if (jsonData.response) {
            result.summary = jsonData.response;
        } else if (jsonData.content) {
            result.summary = jsonData.content;
        } else if (jsonData.message) {
            result.summary = jsonData.message;
        }
        
        if (jsonData.recommendations && Array.isArray(jsonData.recommendations)) {
            result.recommendations = jsonData.recommendations;
        } else if (jsonData.suggestions && Array.isArray(jsonData.suggestions)) {
            result.recommendations = jsonData.suggestions;
        } else if (jsonData.improvements && Array.isArray(jsonData.improvements)) {
            result.recommendations = jsonData.improvements;
        }
        
        if (jsonData.flow_inspiration) {
            result.flowInspiration = jsonData.flow_inspiration;
        } else if (jsonData.inspiration) {
            result.flowInspiration = jsonData.inspiration;
        }
        
        // If we have a summary but no recommendations, create a basic structure
        if (result.summary && !result.recommendations) {
            result.recommendations = [];
        }
    }

    // Helper method to extract COMMAND and punchline from message
    extractCommandAndPunchline(message, result) {
        // Extract COMMAND line
        const commandMatch = message.match(/COMMAND:\s*send\s+.+/i);
        if (commandMatch) {
            result.commandLine = commandMatch[0];
        }

        // Extract punchline (look for **text** or plain text after COMMAND)
        const punchlineMatch = message.match(/\*\*([^*]+)\*\*/) || message.match(/COMMAND:.*\n(.+)$/m);
        if (punchlineMatch) {
            result.punchline = punchlineMatch[1].trim();
        }
    }

    // Parse role-specific structured responses
    parseRoleSpecific(message, stripAll) {
        const result = {
            hasScreenAnalysis: false,
            header: '',
            productMeta: '',
            cards: [],
            recommendation: '',
            commandLine: '',
            punchline: '',
            showDesignsLabel: 'Show designs'
        };

        // Extract COMMAND line
        const commandMatch = message.match(/COMMAND:\s*send\s+.+/i);
        if (commandMatch) {
            result.commandLine = commandMatch[0];
        }

        // Extract punchline (bold text at end or explicit punchline)
        const punchlineMatch = message.match(/\*\*([^*]+)\*\*$/) || message.match(/Punchline:\s*(.+)$/i);
        if (punchlineMatch) {
            result.punchline = stripAll(punchlineMatch[1]);
        }

        // Extract recommendation
        const recMatch = message.match(/Recommendation:\s*([^\n]+)/i) || message.match(/✨\s*Recommendation:\s*([^\n]+)/i);
        if (recMatch) {
            result.recommendation = JSON.stringify({ title: 'Recommendation', text: stripAll(recMatch[1]) });
        }

        const lines = message.split('\n');
        let i = 0;

        // Only Role 1: Product Reviewer
        if (this.tryParseProductReviewer(lines, result, stripAll)) {
            return result;
        }

        return result;
    }

    // Role 1: Product Reviewer
    tryParseProductReviewer(lines, result, stripAll) {
        let foundStructure = false;
        let hasMeta = false;
        let hasSolutions = false;

        // Look for Product: ... | Industry: ... | Platform: ... header
        const metaIdx = lines.findIndex(line => /Product:\s*[^|]+\s*\|\s*Industry:\s*[^|]+\s*\|\s*Platform:/i.test(line));
        if (metaIdx !== -1) {
            result.productMeta = stripAll(lines[metaIdx].trim());
            hasMeta = true;
            foundStructure = true;
        }

        // If meta found, capture the first analysis paragraph right after it (before any structured sections)
        if (hasMeta) {
            let j = metaIdx + 1;
            const paragraphLines = [];
            while (j < lines.length) {
                const nl = lines[j].trim();
                if (!nl) { j++; continue; }
                if (/^\s*[✅✔️🔴]/.test(nl)) break;
                if (/^\s*\d+\./.test(nl)) break;
                if (/^(Recommendation|Recommendations):/i.test(nl)) break;
                if (/^COMMAND:\s*send/i.test(nl)) break;
                if (/^Punchline:/i.test(nl) || /\*\*\s*Punchline\s*:\s*/i.test(nl)) break;
                paragraphLines.push(nl);
                // stop the paragraph at the first blank after at least one line
                let k = j + 1;
                while (k < lines.length && lines[k].trim() === '') k++;
                if (paragraphLines.length > 0) break;
                j++;
            }
            const paragraph = stripAll(paragraphLines.join(' ').replace(/\s+/g, ' ').trim());
            if (paragraph) {
                result.header = `First analysis: ${paragraph}`;
                foundStructure = true;
            }
        }

        // Sequential pass to preserve order: checkmarks, red flags and numbered items
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Skip meta and empty
            if (!line) continue;
            if (/Product:\s*[^|]+\s*\|\s*Industry:\s*[^|]+\s*\|\s*Platform:/i.test(line)) continue;

            // Stop at commands/punchline headers
            if (/^COMMAND:\s*send/i.test(line)) break;
            if (/^Punchline:/i.test(line) || /\*\*\s*Punchline\s*:/i.test(line)) break;

            // Checkmark: Solution N: Title: body OR ✅ Title: body
            let m = line.match(/^\s*[✅✔️]\s*Solution\s*\d*\s*[:=]\s*([^:]+):\s*(.+)$/i);
            if (m) {
                const title = stripAll(m[1]);
                const just = stripAll(m[2]);
                result.cards.push({ title, justification: just });
                foundStructure = true;
                hasSolutions = true;
                continue;
            }
            m = line.match(/^\s*[✅✔️]\s*([^:]+):\s*(.+)$/);
            if (m) {
                const title = stripAll(m[1]);
                const just = stripAll(m[2]);
                result.cards.push({ title, justification: just });
                foundStructure = true;
                hasSolutions = true;
                continue;
            }

            // Red flag items: 🔴 Title: body
            m = line.match(/^\s*🔴\s*([^:]+):\s*(.+)$/);
            if (m) {
                const title = stripAll(m[1]);
                const just = stripAll(m[2]);
                result.cards.push({ title, justification: just });
                foundStructure = true;
                hasSolutions = true;
                continue;
            }

            // Numbered item: 1. Title: body (with optional **Title**)
            const numbered = line.match(/^\s*(\d+)\.\s*(.+)$/);
            if (numbered) {
                const remainder = numbered[2];
                let title = '';
                let bodyFirst = '';
                const md = remainder.match(/^\*\*(.+?)\*\*\s*:\s*(.+)$/);
                const simple = remainder.match(/^([^:]+):\s*(.+)$/);
                if (md) { title = md[1]; bodyFirst = md[2]; }
                else if (simple) { title = simple[1]; bodyFirst = simple[2]; }
                else { title = remainder; bodyFirst = ''; }

                // Collect continuation lines until next numbered/checkmark/Recommendation/COMMAND/Punchline/blank
                let j = i + 1;
                const bodyLines = [bodyFirst].filter(Boolean);
                while (j < lines.length) {
                    const nl = lines[j].trim();
                    if (!nl) break;
                    if (/^\s*\d+\./.test(nl)) break;
                    if (/^\s*[✅✔️]/.test(nl)) break;
                    if (/^(Recommendation|Recommendations):/i.test(nl)) break;
                    if (/^COMMAND:\s*send/i.test(nl)) break;
                    if (/^Punchline:/i.test(nl)) break;
                    bodyLines.push(nl);
                    j++;
                }
                const body = stripAll(bodyLines.join(' ').replace(/\s+/g, ' ').trim());
                result.cards.push({ title: stripAll(title).replace(/\.$/, ''), justification: body });
                foundStructure = true;
                hasSolutions = true;
                i = j - 1;
                continue;
            }

            // Recommendation header encountered; handle below
        }

        // Recommendations: support both single-line and multi-line after header
        let recText = '';
        const recHeaderIdx = lines.findIndex(l => /^(Recommendation|Recommendations):/i.test(l.trim()));
        if (recHeaderIdx !== -1) {
            const header = lines[recHeaderIdx].trim();
            const single = header.match(/^(Recommendation|Recommendations):\s*(.+)$/i);
            if (single && single[2]) {
                recText = single[2];
            } else {
                const collected = [];
                for (let i = recHeaderIdx + 1; i < lines.length; i++) {
                    const l = lines[i].trim();
                    if (!l) break;
                    if (/^COMMAND:\s*send/i.test(l)) break;
                    if (/^Punchline:/i.test(l)) break;
                    if (/^\d+\./.test(l) || /^-\s+/.test(l)) {
                        collected.push(l.replace(/^\d+\.\s*/, '').replace(/^-\s+/, ''));
                continue;
                    }
                    collected.push(l);
                }
                recText = collected.join(' ').replace(/\s+/g, ' ').trim();
            }
        }
        if (recText) {
            result.recommendation = JSON.stringify({ title: 'Recommendation', text: stripAll(recText) });
            foundStructure = true;
        }

        // Only mark as Role 1 if meta and at least one solution exist
        result.hasScreenAnalysis = !!(hasMeta && hasSolutions);
        return result.hasScreenAnalysis;
    }

    // Role 2: Knowledge Expert
    tryParseKnowledgeExpert(lines, result, stripAll) {
        let foundStructure = false;
        let i = 0;

        // Look for Design Topic: header
        const designTopicMatch = lines.find(line => /Design Topic:\s*/i.test(line));
        if (designTopicMatch) {
            result.cards.push({ title: 'Design Topic', justification: stripAll(designTopicMatch.replace(/Design Topic:\s*/i, '')) });
            foundStructure = true;
        }

        // Look for From screens_library: and From design_knowledge:
        for (const line of lines) {
            const screensMatch = line.match(/From screens_library:\s*(.+)/i);
            if (screensMatch) {
                result.cards.push({ title: 'From screens_library', justification: stripAll(screensMatch[1]) });
                foundStructure = true;
            }
            const knowledgeMatch = line.match(/From design_knowledge:\s*(.+)/i);
            if (knowledgeMatch) {
                result.cards.push({ title: 'From design_knowledge', justification: stripAll(knowledgeMatch[1]) });
                foundStructure = true;
            }
        }

        // Look for ✨ Rec items
        for (const line of lines) {
            const recMatch = line.match(/^\s*✨\s*Rec\s*\d*\s*[:\-]\s*(.+)$/);
            if (recMatch) {
                result.cards.push({ title: `Rec ${result.cards.filter(c => c.title.startsWith('Rec')).length + 1}`, justification: stripAll(recMatch[1]) });
                foundStructure = true;
            }
        }

        if (foundStructure) {
            result.hasScreenAnalysis = true;
        }
        return foundStructure;
    }

    // Role 3: Idea Starter
    tryParseIdeaStarter(lines, result, stripAll) {
        let foundStructure = false;
        let i = 0;

        // Look for Flow: header
        const flowMatch = lines.find(line => /Flow:\s*/i.test(line));
        if (flowMatch) {
            result.header = stripAll(flowMatch);
            foundStructure = true;
        }

        // Look for Screen N: items and collect their content
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const screenMatch = line.match(/^Screen\s*(\d+):\s*(.+)$/i);
            if (screenMatch) {
                const screenNum = screenMatch[1];
                const screenTitle = stripAll(screenMatch[2]);
                
                // Collect following lines until next Screen or end
                let j = i + 1;
                const bodyLines = [];
                while (j < lines.length) {
                    const nextLine = lines[j].trim();
                    if (/^Screen\s*\d+:/i.test(nextLine)) break;
                    if (/^References:/i.test(nextLine)) break;
                    if (/^Recommendation:/i.test(nextLine)) break;
                    if (nextLine === '') {
                        j++;
                        continue;
                    }
                    bodyLines.push(nextLine);
                    j++;
                }
                
                const body = stripAll(bodyLines.join('\n'));
                result.cards.push({ 
                    title: `Screen ${screenNum}: ${screenTitle}`, 
                    justification: body 
                });
                foundStructure = true;
                i = j - 1; // Continue from where we left off
            }
        }

        // Look for References:
        const refMatch = lines.find(line => /References:\s*/i.test(line));
        if (refMatch) {
            result.cards.push({ title: 'References', justification: stripAll(refMatch.replace(/References:\s*/i, '')) });
            foundStructure = true;
        }

        if (foundStructure) {
            result.hasScreenAnalysis = true;
        }
        return foundStructure;
    }

    // Role 4: Design Generator
    tryParseDesignGenerator(lines, result, stripAll) {
        let foundStructure = false;
        let i = 0;

        // Look for Context: header
        const contextMatch = lines.find(line => /Context:\s*/i.test(line));
        if (contextMatch) {
            result.header = stripAll(contextMatch);
            foundStructure = true;
        }

        // Look for specific sections
        const sections = ['Suggested layout', 'Interactions', 'Visuals', 'Next steps'];
        for (const section of sections) {
            const sectionMatch = lines.find(line => new RegExp(`${section}:\\s*`, 'i').test(line));
            if (sectionMatch) {
                result.cards.push({ title: section, justification: stripAll(sectionMatch.replace(new RegExp(`${section}:\\s*`, 'i'), '')) });
                foundStructure = true;
            }
        }

        if (foundStructure) {
            result.hasScreenAnalysis = true;
        }
        return foundStructure;
    }

    // Role 5: Quick UI Reviewer
    tryParseQuickUIReviewer(lines, result, stripAll) {
        let foundStructure = false;
        let i = 0;

        // Look for Product: ... | Platform: ... header
        const productMetaMatch = lines.find(line => /Product:\s*[^|]+\s*\|\s*Platform:/i.test(line));
        if (productMetaMatch) {
            result.productMeta = stripAll(productMetaMatch.trim());
            foundStructure = true;
        }

        // Look for checkmark items (both Solution N: and direct Title: formats)
        for (const line of lines) {
            // Try Solution N: format first
            let checkmarkMatch = line.match(/^\s*[✅✔️]\s*Solution\s*\d*[=:]\s*([^:]+):\s*(.+)$/);
            if (checkmarkMatch) {
                const title = stripAll(checkmarkMatch[1]);
                const just = stripAll(checkmarkMatch[2]);
                result.cards.push({ title, justification: just });
                foundStructure = true;
            } else {
                // Try direct Title: format (like "✅ Clear Visual Hierarchy: justification")
                checkmarkMatch = line.match(/^\s*[✅✔️]\s*([^:]+):\s*(.+)$/);
                if (checkmarkMatch) {
                    const title = stripAll(checkmarkMatch[1]);
                    const just = stripAll(checkmarkMatch[2]);
                    result.cards.push({ title, justification: just });
                    foundStructure = true;
                }
            }
        }

        if (foundStructure) {
            result.hasScreenAnalysis = true;
        }
        return foundStructure;
    }

    // Role 6: Metrics Expert
    tryParseMetricsExpert(lines, result, stripAll) {
        let foundStructure = false;
        let i = 0;

        // Look for Industry: ... | Platform: ... header
        const industryMetaMatch = lines.find(line => /Industry:\s*[^|]+\s*\|\s*Platform:/i.test(line));
        if (industryMetaMatch) {
            result.productMeta = stripAll(industryMetaMatch.trim());
            foundStructure = true;
        }

        // Look for specific sections
        const sections = ['Metric focus', 'Current signal', 'Diagnosis', 'Experiments (prioritized)'];
        for (const section of sections) {
            const sectionMatch = lines.find(line => new RegExp(`${section}:\\s*`, 'i').test(line));
            if (sectionMatch) {
                let content = stripAll(sectionMatch.replace(new RegExp(`${section}:\\s*`, 'i'), ''));
                
                // For Experiments, collect all Test N items
                if (section === 'Experiments (prioritized)') {
                    const testItems = [];
                    for (const line of lines) {
                        const testMatch = line.match(/^\s*[✅✔️]\s*Test\s*(\d+):\s*(.+)$/);
                        if (testMatch) {
                            testItems.push(`Test ${testMatch[1]}: ${stripAll(testMatch[2])}`);
                        }
                    }
                    if (testItems.length > 0) {
                        content = testItems.join('\n');
                    }
                }
                
                result.cards.push({ title: section, justification: content });
                foundStructure = true;
            }
        }

        if (foundStructure) {
            result.hasScreenAnalysis = true;
        }
        return foundStructure;
    }

    // Fallback: General chat parsing
    parseGeneralChat(message, stripAll) {
        const result = {
            hasScreenAnalysis: false,
            header: '',
            productMeta: '',
            cards: [],
            recommendation: '',
            commandLine: '',
            punchline: '',
            showDesignsLabel: 'Show designs'
        };

        // Extract COMMAND line
        const commandMatch = message.match(/COMMAND:\s*send\s+.+/i);
        if (commandMatch) {
            result.commandLine = commandMatch[0];
        }

        // Extract punchline
        const punchlineMatch = message.match(/\*\*([^*]+)\*\*$/) || message.match(/Punchline:\s*(.+)$/i);
        if (punchlineMatch) {
            result.punchline = stripAll(punchlineMatch[1]);
        }

        // Extract recommendation
        const recMatch = message.match(/Recommendation:\s*([^\n]+)/i) || message.match(/✨\s*Recommendation:\s*([^\n]+)/i);
        if (recMatch) {
            result.recommendation = JSON.stringify({ title: 'Recommendation', text: stripAll(recMatch[1]) });
        }

        // Extract product meta
        const metaMatch = message.match(/Product:\s*[^\n]+/i);
        if (metaMatch) {
            result.productMeta = metaMatch[0].trim();
        }

        // Process message sequentially to preserve order
        const lines = message.split('\n');
        let i = 0;
        let hasAnyCards = false;
        
        while (i < lines.length) {
            const line = lines[i].trim();
            
            // Check for checkmark-style items
            const checkmarkMatch = line.match(/^\s*[✅✔️]\s*([^:]+):\s*(.+)$/);
            if (checkmarkMatch) {
                const title = stripAll(checkmarkMatch[1]);
                const just = stripAll(checkmarkMatch[2]);
                result.cards.push({ title, justification: just });
                hasAnyCards = true;
                i++;
                continue;
            }

            // Check for numbered items
            const numberedMatch = line.match(/^\d+\.\s*(.+)/);
            if (numberedMatch) {
                const remainder = numberedMatch[1];
                let title = '';
                let just = '';
                const md = remainder.match(/^\*\*(.+?)\*\*\s*:\s*(.+)$/);
                const simple = remainder.match(/^([^:]+):\s*(.+)$/);
                if (md) { title = md[1]; just = md[2]; }
                else if (simple) { title = simple[1]; just = simple[2]; }
                else { title = remainder; just = ''; }

                // Accumulate following lines
                let j = i + 1;
                const bodyLines = [just].filter(Boolean);
                while (j < lines.length) {
                    const l = lines[j];
                    if (/^\s*\d+\./.test(l)) break;
                    if (/^\s*[✅✔️]/.test(l)) break;
                    if (/^\s*###/.test(l)) break;
                    bodyLines.push(l.trim());
                    j++;
                }
                const body = stripAll(bodyLines.join(' ').replace(/\s+/g, ' ').trim());
                result.cards.push({ title: stripAll(title).replace(/\.$/, ''), justification: body });
                hasAnyCards = true;
                i = j;
                continue;
            }

            // Check for markdown headers
            const headerMatch = line.match(/^###\s*(.+)$/);
            if (headerMatch) {
                const title = stripAll(headerMatch[1]);
                // Collect following lines until next header or empty line
                let j = i + 1;
                const bodyLines = [];
                while (j < lines.length) {
                    const l = lines[j].trim();
                    if (/^###/.test(l)) break;
                    if (/^\s*[✅✔️]/.test(l)) break;
                    if (/^\s*\d+\./.test(l)) break;
                    if (l === '') break;
                    bodyLines.push(l);
                    j++;
                }
                const body = stripAll(bodyLines.join(' ').replace(/\s+/g, ' ').trim());
                result.cards.push({ title, justification: body });
                hasAnyCards = true;
                i = j;
                continue;
            }

            // Check for generic labeled sections
            const genericMatch = line.match(/^([A-Za-z][A-Za-z0-9 &()/%-]*):\s*(.+)$/);
            if (genericMatch && !line.includes('Product:') && !line.includes('Industry:') && !line.includes('Platform:')) {
                const title = stripAll(genericMatch[1]);
                const just = stripAll(genericMatch[2]);
                result.cards.push({ title, justification: just });
                hasAnyCards = true;
                i++;
                continue;
            }

            i++;
        }

        // If we found any structured content, mark as screen analysis
        if (hasAnyCards || result.recommendation || result.punchline || result.commandLine) {
            result.hasScreenAnalysis = true;
        }

        return result;
    }

    // Render the Screen Analysis layout inside the chat box
    displayScreenAnalysis(data, chatResultsContent) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message assistant-message';

        // Summary at the top
        const summaryHtml = data.summary ? `
            <div class="message-content">${this.escapeHtml(data.summary)}</div>
        ` : '';

        // Build recommendation cards
        const cardsHtml = data.recommendations.length > 0 ? `
            <div class="cards-stack">
                ${data.recommendations.map((rec, idx) => {
                    const safeTitle = this.escapeHtml(rec.title || `Recommendation ${idx+1}`);
                    const safeWhy = this.escapeHtml(rec.why_it_matters || '');
                    const safeChanges = rec.what_to_change ? rec.what_to_change.map(c => `<li>${this.escapeHtml(c)}</li>`).join('') : '';
                    const safeCriteria = rec.acceptance_criteria ? rec.acceptance_criteria.map(c => `<li>${this.escapeHtml(c)}</li>`).join('') : '';
                    const safeAnalytics = rec.analytics ? rec.analytics.map(a => `<span>${this.escapeHtml(a)}</span>`).join('') : '';
                    
                    return `
                        <div class="improvement-card" data-rec-id="${rec.id}" data-index="${idx}">
                            <div class="improvement-header">
                                <div class="improvement-title">${safeTitle}</div>
                                <div class="improvement-actions">
                                                <button class="upvote-btn" type="button" data-action="upvote" data-rec-id="${rec.id}" title="Upvote">
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28c1.14 0 2.16-.75 2.47-1.88l1.5-6a2.5 2.5 0 0 0-2.47-3.12H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3v11z"/>
                                                    </svg>
                                                </button>
                                                <button class="downvote-btn" type="button" data-action="downvote" data-rec-id="${rec.id}" title="Downvote">
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                        <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72c-1.14 0-2.16.75-2.47 1.88L1.75 9.88A2.5 2.5 0 0 0 4.22 13H10zM17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3V2z"/>
                                                    </svg>
                                                </button>
                                    <button class="go-deeper-btn" type="button" data-action="dive_deeper" data-rec-id="${rec.id}" title="Go deeper">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                                        </svg>
                                    </button>
                                    <button class="improvement-chevron" type="button" title="Expand">
                                        <img src="./assets/images/icons/icon-chevron-down-blk.png" alt="Open" class="auth-icon-img" />
                                    </button>
                                </div>
                            </div>
                            <div class="improvement-body">
                                <div class="rec-chips">
                                    <span class="chip chip-category">${this.escapeHtml(rec.category || '')}</span>
                                    <span class="chip chip-impact chip-${rec.impact || 'medium'}">${this.escapeHtml(rec.impact || 'medium')} Impact</span>
                                    <span class="chip chip-confidence chip-${rec.confidence || 'medium'}">${this.escapeHtml(rec.confidence || 'medium')} Confidence</span>
                                </div>
                                <div class="rec-section">
                                    <h4>Why it matters</h4>
                                    <p>${safeWhy}</p>
                                </div>
                                <div class="rec-section">
                                    <h4>What to change</h4>
                                    <ul>${safeChanges}</ul>
                                </div>
                                <div class="rec-section">
                                    <h4>Acceptance criteria</h4>
                                    <ul>${safeCriteria}</ul>
                                </div>
                                <div class="rec-section">
                                    <h4>Analytics</h4>
                                    <div class="analytics-badges">${safeAnalytics}</div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        ` : '';

        // Flow inspiration
        const flowInspirationHtml = data.flowInspiration ? `
            <div class="flow-inspiration">
                <h4>Flow inspiration: ${this.escapeHtml(data.flowInspiration.app)} — ${this.escapeHtml(data.flowInspiration.flow)}</h4>
                <p>${this.escapeHtml(data.flowInspiration.why_this_flow || '')}</p>
                <button class="preview-flow-btn" type="button" data-command="${this.escapeHtml(data.commandLine)}">Preview flow</button>
            </div>
        ` : '';

        // Punchline at the end
        const punchlineMessage = data.punchline ? `
            <div class="message-content punchline">${this.escapeHtml(data.punchline)}</div>
        ` : '';

        messageDiv.innerHTML = `
            ${summaryHtml}
            ${cardsHtml}
            ${flowInspirationHtml}
            ${punchlineMessage}
            <div class="message-time">${new Date().toLocaleTimeString()}</div>
        `;

        chatResultsContent.appendChild(messageDiv);
        chatResultsContent.scrollTop = chatResultsContent.scrollHeight;

        // Handle recommendation card interactions
        messageDiv.addEventListener('click', (e) => {
            const upvoteBtn = e.target.closest('[data-action="upvote"]');
            if (upvoteBtn) {
                e.preventDefault();
                e.stopPropagation();
                const recId = upvoteBtn.dataset.recId;
                this.handleUpvote(recId, upvoteBtn);
                return;
            }

            const downvoteBtn = e.target.closest('[data-action="downvote"]');
            if (downvoteBtn) {
                e.preventDefault();
                e.stopPropagation();
                const recId = downvoteBtn.dataset.recId;
                this.handleDownvote(recId, downvoteBtn);
                return;
            }

            const goDeeperBtn = e.target.closest('[data-action="dive_deeper"]');
            if (goDeeperBtn) {
                e.preventDefault();
                e.stopPropagation();
                const recId = goDeeperBtn.dataset.recId;
                this.handleGoDeeper(recId, goDeeperBtn);
                return;
            }

            const chevronBtn = e.target.closest('.improvement-chevron');
            if (chevronBtn) {
                e.preventDefault();
                e.stopPropagation();
                const card = chevronBtn.closest('.improvement-card');
                if (card) card.classList.toggle('expanded');
                return;
            }

            const previewFlowBtn = e.target.closest('.preview-flow-btn');
            if (previewFlowBtn) {
                e.preventDefault();
                e.stopPropagation();
                const command = previewFlowBtn.dataset.command;
                if (command) {
                    this.processCommandImagesFromMessage(command, true);
                }
                return;
            }
        });
    }

    // Handle upvote action
    handleUpvote(recId, button) {
        // Visual feedback - mark as endorsed
        button.classList.add('endorsed');
        button.textContent = '✓';
        // No API call needed for upvote
    }

    // Handle downvote action
    async handleDownvote(recId, button) {
        try {
            // Send downvote action with context
            const context = this.getCurrentContext();
            const payload = {
                action: 'downvote',
                rec_id: recId,
                ...context
            };
            
            const response = await this.sendToAgent(JSON.stringify(payload));
            if (response) {
                // Re-render with new recommendations
                const chatResultsContent = document.getElementById('chatResultsContent');
                const analysis = this.parseScreenAnalysis(response);
                if (analysis.hasScreenAnalysis) {
                    // Replace the current message with new analysis
                    const currentMessage = button.closest('.chat-message');
                    if (currentMessage) {
                        currentMessage.remove();
                    }
                    this.displayScreenAnalysis(analysis, chatResultsContent);
                }
            }
        } catch (error) {
            console.error('Downvote failed:', error);
        }
    }

    // Handle go deeper action
    async handleGoDeeper(recId, button) {
        try {
            console.log('Go deeper clicked for:', recId);
            
            // Send dive deeper action with context
            const context = this.getCurrentContext();
            const payload = {
                action: 'dive_deeper',
                rec_id: recId,
                ...context
            };
            
            console.log('Sending payload:', payload);
            
            // Add the payload as a user message
            this.addMessageToChat(JSON.stringify(payload), 'user');
            
            // Send to agent directly without going through addMessageToChat
            const response = await this.sendDeepDiveRequest(JSON.stringify(payload));
            console.log('Received response:', response);
            
            if (response) {
                // Parse and replace the specific card with detailed view
                const parsed = this.parseDeepDive(response);
                console.log('Parsed deep dive:', parsed);
                
                if (parsed && parsed.deepDive) {
                    console.log('Replacing card with deep dive');
                    this.replaceCardWithDeepDive(recId, parsed.deepDive, parsed.commandLine, parsed.punchline);
                    
                    // Focus on the updated card
                    setTimeout(() => {
                        const updatedCard = document.querySelector(`[data-rec-id="${recId}"]`);
                        if (updatedCard) {
                            updatedCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            updatedCard.style.border = '2px solid #007bff';
                            setTimeout(() => {
                                updatedCard.style.border = '';
                            }, 2000);
                        }
                    }, 100);
                } else {
                    console.log('Failed to parse deep dive response');
                    // Show error toast if parsing failed
                    if (typeof this.showToast === 'function') {
                        this.showToast('Couldn\'t parse deep dive response. Retry.', 'error');
                    }
                }
            } else {
                console.log('No response received');
            }
        } catch (error) {
            console.error('Go deeper failed:', error);
        }
    }

    // Send deep-dive request directly without processing through addMessageToChat
    async sendDeepDiveRequest(message) {
        try {
            const context = this.getCurrentContext();
            const payload = {
                message: message,
                ...context
            };
            
            // Use the same authentication method as regular chat
            const authToken = await this.supabase.auth.getSession();
            const token = authToken.data?.session?.access_token;
            
            console.log('Deep-dive auth token:', token ? 'Present' : 'Missing');
            
            // Send to agent using existing chat API
            const response = await fetch(window.AGENT_CFG.CHAT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            
            console.log('Deep-dive response status:', response.status);
            
            if (response.ok) {
                const data = await response.json();
                console.log('Deep-dive response data:', data);
                if (data.response) {
                    // Return the response without adding to chat
                    return data.response;
                }
            } else {
                console.error('Deep-dive request failed:', response.status, response.statusText);
            }
        } catch (error) {
            console.error('Failed to send deep-dive request:', error);
        }
    }

    // Parse deep-dive JSON response
    parseDeepDive(message) {
        try {
            // Extract JSON object from message
            const jsonMatch = message.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return null;

            const deepDive = JSON.parse(jsonMatch[0]);
            
            // Extract COMMAND line
            const commandMatch = message.match(/COMMAND:\s*send\s+.+/i);
            const commandLine = commandMatch ? commandMatch[0] : '';

            // Extract punchline
            const punchlineMatch = message.match(/\*\*([^*]+)\*\*/) || message.match(/COMMAND:.*\n(.+)$/m);
            const punchline = punchlineMatch ? punchlineMatch[1].trim() : '';

            return {
                deepDive,
                commandLine,
                punchline
            };
        } catch (error) {
            console.error('Failed to parse deep dive:', error);
            return null;
        }
    }

    // Replace card with deep-dive detail view
    replaceCardWithDeepDive(recId, deepDiveData, commandLine = '', punchline = '') {
        const card = document.querySelector(`[data-rec-id="${recId}"]`);
        console.log('Looking for card with recId:', recId);
        console.log('Found card:', card);
        if (!card) {
            console.error('Card not found for recId:', recId);
            return;
        }

        const safeSteps = deepDiveData.steps ? deepDiveData.steps.map(s => `<li>${this.escapeHtml(s)}</li>`).join('') : '';
        const safeStates = deepDiveData.state_chart ? deepDiveData.state_chart.map(s => `<li>${this.escapeHtml(s)}</li>`).join('') : '';
        const safeEdges = deepDiveData.edge_cases ? deepDiveData.edge_cases.map(e => `<li>${this.escapeHtml(e)}</li>`).join('') : '';
        const safeCopy = deepDiveData.copy_examples ? deepDiveData.copy_examples.map(c => `<li>${this.escapeHtml(c)}</li>`).join('') : '';
        const safeCriteria = deepDiveData.acceptance_criteria ? deepDiveData.acceptance_criteria.map(c => `<li>${this.escapeHtml(c)}</li>`).join('') : '';
        const safeAnalytics = deepDiveData.analytics ? deepDiveData.analytics.map(a => `<span>${this.escapeHtml(a)}</span>`).join('') : '';
        const safeRollout = deepDiveData.rollout_plan ? deepDiveData.rollout_plan.map(r => `<li>${this.escapeHtml(r)}</li>`).join('') : '';

        // Get original card data for subchips
        const originalCard = card;
        const originalCategory = originalCard.querySelector('.chip-category')?.textContent || '';
        const originalImpact = originalCard.querySelector('.chip-impact')?.textContent || '';
        const originalConfidence = originalCard.querySelector('.chip-confidence')?.textContent || '';

        const deepDiveHtml = `
            <div class="improvement-card deep-dive expanded" data-rec-id="${recId}">
                <div class="improvement-header">
                    <div class="improvement-title">${this.escapeHtml(deepDiveData.title || 'Deep Dive')}</div>
                    <div class="improvement-actions">
                        <button class="upvote-btn" type="button" data-action="upvote" data-rec-id="${recId}" title="Upvote">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28c1.14 0 2.16-.75 2.47-1.88l1.5-6a2.5 2.5 0 0 0-2.47-3.12H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3v11z"/>
                            </svg>
                        </button>
                        <button class="downvote-btn" type="button" data-action="downvote" data-rec-id="${recId}" title="Downvote">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72c-1.14 0-2.16.75-2.47 1.88L1.75 9.88A2.5 2.5 0 0 0 4.22 13H10zM17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3V2z"/>
                            </svg>
                        </button>
                        <button class="go-deeper-btn" type="button" data-action="dive_deeper" data-rec-id="${recId}" title="Go deeper">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                            </svg>
                        </button>
                        <button class="improvement-chevron" type="button" title="Expand">
                            <img src="./assets/images/icons/icon-chevron-down-blk.png" alt="Open" class="auth-icon-img" />
                        </button>
                    </div>
                </div>
                <div class="improvement-body">
                    <div class="rec-chips">
                        <span class="chip chip-rec-id">${recId}</span>
                        ${originalCategory ? `<span class="chip chip-category">${this.escapeHtml(originalCategory)}</span>` : ''}
                        ${originalImpact ? `<span class="chip chip-impact">${this.escapeHtml(originalImpact)}</span>` : ''}
                        ${originalConfidence ? `<span class="chip chip-confidence">${this.escapeHtml(originalConfidence)}</span>` : ''}
                    </div>
                    <div class="rec-section">
                        <h4>Steps <button class="copy-btn" data-copy="steps" title="Copy steps">Copy</button></h4>
                        <ol>${safeSteps}</ol>
                    </div>
                    <div class="rec-section">
                        <h4>State chart</h4>
                        <ul>${safeStates}</ul>
                    </div>
                    <div class="rec-section">
                        <h4>Edge cases</h4>
                        <ul>${safeEdges}</ul>
                    </div>
                    <div class="rec-section">
                        <h4>Copy examples <button class="copy-btn" data-copy="copy" title="Copy all">Copy all</button></h4>
                        <ul class="copy-examples">${safeCopy}</ul>
                    </div>
                    <div class="rec-section">
                        <h4>Acceptance criteria <button class="copy-btn" data-copy="criteria" title="Copy AC">Copy AC</button></h4>
                        <ul>${safeCriteria}</ul>
                    </div>
                    <div class="rec-section">
                        <h4>Analytics <button class="copy-btn" data-copy="analytics" title="Copy events">Copy events</button></h4>
                        <div class="analytics-badges">${safeAnalytics}</div>
                    </div>
                    <div class="rec-section">
                        <h4>Rollout plan <button class="copy-btn" data-copy="rollout" title="Copy rollout">Copy rollout</button></h4>
                        <ul>${safeRollout}</ul>
                    </div>
                    ${commandLine ? `
                        <div class="flow-inspiration">
                            <button class="preview-flow-btn" type="button" data-command="${this.escapeHtml(commandLine)}">Preview flow</button>
                        </div>
                    ` : ''}
                    ${punchline ? `
                        <div class="punchline">${this.escapeHtml(punchline)}</div>
                    ` : ''}
                </div>
            </div>
        `;

        console.log('Replacing card HTML with deep dive content');
        card.outerHTML = deepDiveHtml;
        
        // Wait a moment for DOM to update, then add copy button event listeners
        setTimeout(() => {
            const newCard = document.querySelector(`[data-rec-id="${recId}"]`);
            console.log('New card after replacement:', newCard);
            console.log('New card innerHTML:', newCard ? newCard.innerHTML.substring(0, 200) + '...' : 'Not found');
            this.setupCopyButtons(recId);
            console.log('Deep dive replacement completed');
        }, 100);
    }

    // Setup copy button functionality
    setupCopyButtons(recId) {
        const card = document.querySelector(`[data-rec-id="${recId}"]`);
        if (!card) return;

        card.addEventListener('click', (e) => {
            const copyBtn = e.target.closest('.copy-btn');
            if (!copyBtn) return;

            e.preventDefault();
            e.stopPropagation();

            const copyType = copyBtn.dataset.copy;
            const section = copyBtn.closest('.rec-section');
            if (!section) return;

            let textToCopy = '';
            
            switch (copyType) {
                case 'steps':
                    const stepsList = section.querySelector('ol');
                    if (stepsList) {
                        textToCopy = Array.from(stepsList.querySelectorAll('li'))
                            .map((li, index) => `${index + 1}. ${li.textContent}`)
                            .join('\n');
                    }
                    break;
                case 'copy':
                    const copyList = section.querySelector('.copy-examples');
                    if (copyList) {
                        textToCopy = Array.from(copyList.querySelectorAll('li'))
                            .map(li => li.textContent)
                            .join('\n');
                    }
                    break;
                case 'criteria':
                    const criteriaList = section.querySelector('ul');
                    if (criteriaList) {
                        textToCopy = Array.from(criteriaList.querySelectorAll('li'))
                            .map(li => `• ${li.textContent}`)
                            .join('\n');
                    }
                    break;
                case 'analytics':
                    const analyticsDiv = section.querySelector('.analytics-badges');
                    if (analyticsDiv) {
                        textToCopy = Array.from(analyticsDiv.querySelectorAll('span'))
                            .map(span => span.textContent)
                            .join('\n');
                    }
                    break;
                case 'rollout':
                    const rolloutList = section.querySelector('ul');
                    if (rolloutList) {
                        textToCopy = Array.from(rolloutList.querySelectorAll('li'))
                            .map(li => `• ${li.textContent}`)
                            .join('\n');
                    }
                    break;
            }

            if (textToCopy) {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    // Show brief success feedback
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = 'Copied!';
                    copyBtn.style.background = '#10b981';
                    copyBtn.style.color = 'white';
                    setTimeout(() => {
                        copyBtn.textContent = originalText;
                        copyBtn.style.background = '';
                        copyBtn.style.color = '';
                    }, 1000);
                }).catch(err => {
                    console.error('Failed to copy text:', err);
                });
            }
        });
    }

    // Send payload to agent
    async sendToAgent(payload) {
        // Send payload to agent using existing chat functionality
        try {
            // Add the payload as a user message
            this.addMessageToChat(payload, 'user');
            
            // Send to agent with context
            const response = await this.sendToAgentWithContext(payload);
            
            // Don't add the response as a regular message - let the caller handle it
            return response;
        } catch (error) {
            console.error('Agent communication failed:', error);
            return null;
        }
    }

    // Toggle Arguments card visibility
    toggleArgumentsCard() {
        const card = document.getElementById('argumentsCard');
        if (card) {
            card.classList.toggle('expanded');
        }
    }

    // Show solution details (placeholder for future implementation)
    showSolutionDetails(index) {
        console.log(`Showing details for solution ${index + 1}`);
        // TODO: Implement detailed solution view
    }

    // Mount images from a COMMAND line without adding an extra bubble
    async processCommandImagesFromMessage(message, makeVisible = false) {
        try {
            const commandMatch = message.match(/COMMAND:\s*send\s+(.+)/i);
            if (!commandMatch) return;
            const imageNames = commandMatch[1].split(',').map(s => s.trim());
            const appName = this.extractAppNameFromImages(imageNames);
            const flowName = this.inferFlowFromImages ? this.inferFlowFromImages(imageNames, appName) : '';
            const fetched = await (this.fetchCommandImagesByAppFlow ? this.fetchCommandImagesByAppFlow(appName, flowName) : this.fetchCommandImages(imageNames));
            let realImages = Array.isArray(fetched) ? fetched : [];
            if (realImages.length > 0 && realImages[0] && realImages[0].screens) {
                const flat = [];
                realImages.forEach(flow => (flow.screens || []).forEach(s => flat.push({ imageUrl: s.imageUrl, screenName: s.screenName || s.imageName })));
                realImages = flat;
            }
            this.prepareCommandImages(appName, imageNames, realImages);
            // Ensure images are visible by default when requested
            this.displayCommandImages(appName, imageNames, realImages, !!makeVisible);
        } catch (e) {
            console.warn('processCommandImagesFromMessage failed', e);
        }
    }

    // Process COMMAND message and display images in analysis area
    async processCommandMessage(message) {
        // Extract the command part
        const commandMatch = message.match(/COMMAND:\s*send\s+(.+)/i);
        if (!commandMatch) return;

        const imageNames = commandMatch[1].split(',').map(name => name.trim());
        const appName = this.extractAppNameFromImages(imageNames);
        
        // Fetch real images via edge using inferred app/flow
        const flowName = this.inferFlowFromImages ? this.inferFlowFromImages(imageNames, appName) : '';
        console.debug('[INSPIRATIONS START]', { appName, flowName, imageNames });
        const fetched = await (this.fetchCommandImagesByAppFlow ? this.fetchCommandImagesByAppFlow(appName, flowName) : this.fetchCommandImages(imageNames));
        // Normalize to flat images list if needed (handle flows array)
        let realImages = Array.isArray(fetched) ? fetched : [];
        if (realImages.length > 0 && realImages[0] && realImages[0].screens) {
            const flat = [];
            realImages.forEach(flow => (flow.screens || []).forEach(s => flat.push({ imageUrl: s.imageUrl, screenName: s.screenName || s.imageName })));
            realImages = flat;
        }
        console.debug('[INSPIRATIONS RESULT images]', realImages);
        
        // Prepare and immediately show images
        this.prepareCommandImages(appName, imageNames, realImages);
        this.displayCommandImages(appName, imageNames, realImages, true);
        
        // Keep the COMMAND line in the message
        const cleanMessage = message;
        const chatResultsContent = document.getElementById('chatResultsContent');
        
        // Create message element with show images tag (no inline JS)
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message assistant-message';
        messageDiv.innerHTML = `
            <div class="message-content">${cleanMessage}</div>
            <button class="show-images-tag active" type="button" data-app="${encodeURIComponent(appName)}">
                <span>Hide ${appName} screens</span>
            </button>
            <div class="message-time">${new Date().toLocaleTimeString()}</div>
        `;

        chatResultsContent.appendChild(messageDiv);
        chatResultsContent.scrollTop = chatResultsContent.scrollHeight;

        // Bind click handler safely
        const btn = messageDiv.querySelector('.show-images-tag');
        if (btn) {
            btn.addEventListener('click', () => {
                const app = decodeURIComponent(btn.getAttribute('data-app') || '');
                this.toggleCommandImages(app);
                // Toggle label
                const isActive = btn.classList.toggle('active');
                const label = btn.querySelector('span:nth-child(2)');
                if (label) {
                    label.textContent = isActive ? `Hide ${app} screens` : `Show ${app} screens`;
                }
            });
        }

        // Delegate other dynamic buttons
        messageDiv.addEventListener('click', (e) => {
            const moreBtn = e.target.closest('.solution-more-btn');
            if (moreBtn) {
                const idx = Number(moreBtn.getAttribute('data-solution-index') || '0');
                this.showSolutionDetails(idx);
            }
            const argsHeader = e.target.closest('.arguments-card-header');
            if (argsHeader) {
                this.toggleArgumentsCard();
            }
        });
    }

    // Extract app name from image names
    extractAppNameFromImages(imageNames) {
        if (imageNames.length === 0) return 'App';
        
        // Take the first image name and extract app name (everything before the last part)
        const firstName = imageNames[0];
        const parts = firstName.split(' ');
        
        // Remove the last part (usually a number or description) to get app name
        if (parts.length > 2) {
            return parts.slice(0, -2).join(' ');
        }
        return parts[0] || 'App';
    }

    // Infer flow name from first image name by stripping app and trailing counters
    inferFlowFromImages(imageNames, appName) {
        if (!Array.isArray(imageNames) || imageNames.length === 0) return '';
        const first = String(imageNames[0] || '');
        let rest = first.startsWith(appName) ? first.slice(appName.length).trim() : first;
        rest = rest.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
        const parts = rest.split(' ').filter(Boolean);
        while (parts.length > 0 && /^(\d+|\d+\.[a-zA-Z0-9]+)$/.test(parts[parts.length - 1])) parts.pop();
        return parts.join(' ').trim();
    }

    // Get image URL for command image from backend (legacy fallback)
    async fetchCommandImages(imageNames) {
        try {
            const authHeader = await this.getAuthHeader();
            const payload = { 
                recommendation: { app: (imageNames[0]||'').split(' ')[0]||'', flow: (imageNames[0]||'').split(' ').slice(1).join(' ')||'' }
            };
            console.debug('[INSPIRATIONS REQUEST fallback]', { url: `${this.chatUrl}/inspirations`, payload });
            const resp = await fetch(`${this.chatUrl}/inspirations`, {
                method: 'POST',
                headers: {
                    ...authHeader,
                    ...(this.supabaseKey ? { 'apikey': this.supabaseKey } : {}),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
            }

            const data = await resp.json();
            return data.data || [];
        } catch (error) {
            console.error('Error fetching command images:', error);
            return [];
        }
    }

    // New: fetch images by explicit app/flow
    async fetchCommandImagesByAppFlow(appName, flowName) {
        try {
            const authHeader = await this.getAuthHeader();
            const payload = { recommendation: { app: appName, flow: flowName } };
            console.debug('[INSPIRATIONS REQUEST]', { url: `${this.chatUrl}/inspirations`, payload });
            const resp = await fetch(`${this.chatUrl}/inspirations`, {
                method: 'POST',
                headers: {
                    ...authHeader,
                    ...(this.supabaseKey ? { 'apikey': this.supabaseKey } : {}),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            if (!resp.ok) {
                const errText = await resp.text();
                console.error('[INSPIRATIONS ERROR]', resp.status, errText);
                throw new Error(`HTTP ${resp.status}: ${errText}`);
            }
            const data = await resp.json();
            console.debug('[INSPIRATIONS RESPONSE]', data);
            // Normalize return shape (flows with screens or direct list)
            if (Array.isArray(data.data)) {
                const arr = data.data;
                if (arr.length > 0 && arr[0].screens) {
                    // flows
                    const flat = [];
                    arr.forEach(flow => (flow.screens || []).forEach(s => flat.push({ imageUrl: s.imageUrl, screenName: s.screenName || s.imageName })));
                    return flat;
                }
                return arr;
            }
            return [];
        } catch (error) {
            console.error('Error fetching command images (by app/flow):', error);
            return [];
        }
    }

    // Get placeholder image URL as fallback
    getPlaceholderImageUrl(imageName) {
        const text = (imageName || '?').slice(0, 18);
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='213'>
  <rect width='100%' height='100%' fill='#e5e5e7'/>
  <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='Arial, sans-serif' font-size='12' fill='#666'>${text}</text>
</svg>`;
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }

    // Prepare command images (create but keep hidden)
    prepareCommandImages(appName, imageNames, realImages = []) {
        this.currentCommandImages = {
            appName,
            imageNames,
            realImages
        };
        
        // Create the images section but keep it hidden
        this.displayCommandImages(appName, imageNames, realImages, false);
    }

    // Toggle command images visibility
    toggleCommandImages(appName) {
        const commandSection = document.querySelector('.command-images-section');
        const showTag = document.querySelector('.show-images-tag');
        
        if (commandSection) {
            // Ensure the section is mounted
            commandSection.classList.add('visible');
            const container = commandSection.querySelector('.app-container');
            // If currently expanded, switch to minimized pill (like the toggle header)
            const isExpanded = container && container.classList.contains('expanded');
            if (isExpanded) {
                container.classList.remove('expanded');
                commandSection.classList.add('minimized');
            } else {
                // Expand back from minimized
                commandSection.classList.remove('minimized');
                if (container) container.classList.add('expanded');
            }
            if (showTag) {
                const minimized = commandSection.classList.contains('minimized');
                showTag.classList.toggle('active', !minimized);
                const label = showTag.querySelector('span:nth-child(2)');
                if (label) label.textContent = minimized ? `Show ${appName} screens` : `Hide ${appName} screens`;
            }
            // Keep the pill in view when minimizing
            if (commandSection.classList.contains('minimized')) {
                try { commandSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch {}
            }
        }
    }

    // Display command images in analysis area
    displayCommandImages(appName, imageNames, realImages = [], visible = false) {
        const analysisArea = document.querySelector('.analysis-area');
        if (!analysisArea) return;

        // Remove any existing command images section
        const existingSection = analysisArea.querySelector('.command-images-section');
        if (existingSection) {
            existingSection.remove();
        }

        // Create command images section
        const commandSection = document.createElement('div');
        commandSection.className = `command-images-section${visible ? ' visible' : ''}`;
        
        // Build images HTML: prefer realImages array from edge; fallback to placeholders
        let imagesHtml = '';
        if (Array.isArray(realImages) && realImages.length > 0) {
            imagesHtml = realImages.map((img, idx) => {
                const name = img.screenName || `Screen ${idx+1}`;
                const url = img.imageUrl || '';
                return `
                    <div class="app-image-item" data-image-name="${encodeURIComponent(name)}" data-image-url="${encodeURIComponent(url)}">
                        <img src="${url}" alt="${name}">
                    </div>
                `;
            }).join('');
        } else {
            imagesHtml = imageNames.map((imageName) => {
                const imageUrl = this.getPlaceholderImageUrl(imageName);
                return `
                    <div class="app-image-item" data-image-name="${encodeURIComponent(imageName)}" data-image-url="${encodeURIComponent(imageUrl)}">
                        <img src="${imageUrl}" alt="${imageName}">
                    </div>
                `;
            }).join('');
        }
        
        commandSection.innerHTML = `
            <div class="command-images-content">
                <div class="app-container">
                    <div class="app-container-header">
                        <div>
                            <h3 class="app-container-title">${appName}</h3>
                            <p class="app-container-subtitle">${(realImages && realImages.length) || imageNames.length} screens found</p>
                        </div>
                        <span class="app-container-toggle">▼</span>
                    </div>
                    <div class="app-container-content">
                        <div class="app-images-grid">
                            ${imagesHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Insert into the analysis top row next to the large image display
        const analysisTopRow = analysisArea.querySelector('.analysis-top-row');
        if (analysisTopRow) {
            analysisTopRow.appendChild(commandSection);
        } else {
            // Fallback: insert after the large image display if top row doesn't exist
            const largeImageDisplay = analysisArea.querySelector('.large-image-display');
            if (largeImageDisplay) {
                largeImageDisplay.insertAdjacentElement('afterend', commandSection);
            } else {
                analysisArea.appendChild(commandSection);
            }
        }

        // Toggle expand/collapse safely
        const header = commandSection.querySelector('.app-container-header');
        if (header) {
            header.addEventListener('click', () => {
                const container = header.closest('.app-container');
                if (container) container.classList.toggle('expanded');
            });
        }

        // Delegate clicks to images
        commandSection.addEventListener('click', (e) => {
            const item = e.target.closest('.app-image-item');
            if (!item) return;
            const imageName = decodeURIComponent(item.getAttribute('data-image-name') || '');
            const imageUrl = decodeURIComponent(item.getAttribute('data-image-url') || '');
            this.selectCommandImage(imageName, imageUrl);
        });
    }

    // Handle clicking on a command image
    selectCommandImage(imageName, imageUrl) {
        console.log('Selected image:', imageName, imageUrl);
        
        // Show fullscreen modal instead of loading into large display
        this.showImageModal(imageUrl, imageName);
    }

    // Display image from URL in large image area
    displayLargeImageFromUrl(imageUrl, filename) {
        const largeImagePlaceholder = document.querySelector('.large-image-placeholder');
        const largeImageContent = document.getElementById('largeImageContent');
        const largeImage = document.getElementById('largeImage');
        const largeImageDisplay = document.getElementById('largeImageDisplay');
        const largeImageContainer = document.querySelector('.large-image-container');

        // Hide placeholder and show image
        largeImagePlaceholder.classList.add('hidden');
        largeImageContent.classList.remove('hidden');
        
        // Add classes to indicate image is loaded
        largeImageDisplay.classList.add('has-image');
        largeImageContainer.classList.add('has-image');
        
        // Set image source
        largeImage.src = imageUrl;
        largeImage.alt = filename;
        
        // Store image data for potential chat use
        this.uploadedImageData = {
            dataUrl: imageUrl,
            filename: filename
        };
    }

    setupChatStates() {
        const mainChatInput = document.getElementById('mainChatInput');
        const mainChatSendBtn = document.getElementById('mainChatSendBtn');
        const chatImageBtn = document.getElementById('chatImageBtn');
        
        // Step navigation buttons
        const step2BackBtn = document.getElementById('step2BackBtn');
        const step2NextBtn = document.getElementById('step2NextBtn');
        const step3BackBtn = document.getElementById('step3BackBtn');
        const step3NextBtn = document.getElementById('step3NextBtn');
        const step4BackBtn = document.getElementById('step4BackBtn');
        const step4NextBtn = document.getElementById('step4NextBtn');
        const step5BackBtn = document.getElementById('step5BackBtn');
        const step5NextBtn = document.getElementById('step5NextBtn');
        const step6BackBtn = document.getElementById('step6BackBtn');
        const step6SendBtn = document.getElementById('step6SendBtn');
        const step6Input = document.getElementById('step6Input');

        // Handle initial state input
        mainChatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMainChatMessage();
            }
        });

        mainChatSendBtn.addEventListener('click', () => {
            this.sendMainChatMessage();
        });

        // Handle image upload in chat
        chatImageBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.handleChatImageUpload(file);
                    this.goToStep(2); // Move directly to product type selection
                }
            };
            input.click();
        });

        // Step navigation
        step2BackBtn.addEventListener('click', () => {
            this.goToStep(0);
        });

        step2NextBtn.addEventListener('click', () => {
            this.goToStep(3);
        });

        step3BackBtn.addEventListener('click', () => {
            this.goToStep(2);
        });

        step3NextBtn.addEventListener('click', () => {
            this.goToStep(4);
        });

        step4BackBtn.addEventListener('click', () => {
            this.goToStep(3);
        });

        step4NextBtn.addEventListener('click', () => {
            this.goToStep(5);
        });

        step5BackBtn.addEventListener('click', () => {
            this.goToStep(4);
        });

        step5NextBtn.addEventListener('click', () => {
            this.goToStep(6);
        });

        step6BackBtn.addEventListener('click', () => {
            this.goToStep(5);
        });

        step6SendBtn.addEventListener('click', () => {
            this.sendStep6Message();
        });

        step6Input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendStep6Message();
            }
        });

        // Handle option tag selection
        this.setupOptionTags();
        
        // Handle image close buttons
        this.setupImageCloseButtons();
    }

    goToStep(stepNumber) {
        // Hide all steps
        document.querySelectorAll('.chat-step').forEach(step => {
            step.classList.add('hidden');
            step.classList.remove('active');
        });

        // Show target step
        const targetStep = document.getElementById(`chatStep${stepNumber}`);
        if (targetStep) {
            targetStep.classList.remove('hidden');
            targetStep.classList.add('active');
        }

        // Update progress bar (adjust for 5-step flow)
        const adjustedStep = stepNumber === 0 ? 0 : stepNumber - 1;
        this.updateProgressBar(adjustedStep);
    }


    updateProgressBar(stepNumber) {
        const progressFill = document.getElementById('chatProgressFill');
        if (!progressFill) return;

        let progress = 0;
        switch (stepNumber) {
            case 0:
                progress = 0;
                break;
            case 1:
                progress = 16.67;
                break;
            case 2:
                progress = 33.33;
                break;
            case 3:
                progress = 50;
                break;
            case 4:
                progress = 66.67;
                break;
            case 5:
                progress = 83.33;
                break;
            case 6:
                progress = 100;
                break;
        }

        progressFill.style.width = `${progress}%`;
    }

    setupOptionTags() {
        // Handle option tag clicks
        document.querySelectorAll('.option-tag').forEach(tag => {
            tag.addEventListener('click', (e) => {
                const step = e.target.closest('.chat-step');
                const stepOptions = step.querySelectorAll('.option-tag');
                
                // Remove selected class from all options in this step
                stepOptions.forEach(option => option.classList.remove('selected'));
                
                // Add selected class to clicked option
                e.target.classList.add('selected');
            });
        });
    }

    sendStep6Message() {
        const step6Input = document.getElementById('step6Input');
        const message = step6Input.value.trim();
        if (message) {
            // Collect all selected options
            const productType = this.getSelectedOption('chatStep2');
            const industry = this.getSelectedOption('chatStep3');
            const improveWhat = this.getSelectedOption('chatStep4');
            const optimizeFor = this.getSelectedOption('chatStep5');
            const context = message;

            // Create comprehensive message
            const fullMessage = `Product type: ${productType}, Industry: ${industry}, Improve: ${improveWhat}, Optimize for: ${optimizeFor}, Context: ${context}`;
            
            // Send the message
            this.sendMainChatMessage(fullMessage);
            
            // Clear input
            step6Input.value = '';
            
            // Reset to initial state
            this.goToStep(0);
        }
    }

    getSelectedOption(stepId) {
        const step = document.getElementById(stepId);
        const selectedTag = step.querySelector('.option-tag.selected');
        return selectedTag ? selectedTag.dataset.value : '';
    }

    setupImageCloseButtons() {
        // Handle image close buttons for each step
        const closeButtons = [
            'step2ImageCloseBtn', 
            'step3ImageCloseBtn',
            'step4ImageCloseBtn',
            'step5ImageCloseBtn',
            'step6ImageCloseBtn'
        ];

        closeButtons.forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (button) {
                button.addEventListener('click', () => {
                    this.removeUploadedImage();
                });
            }
        });
    }


    removeUploadedImage() {
        // Clear uploaded image data
        this.uploadedImageData = null;
        
        // Remove image from large image display area
        this.removeLargeImage();
        
        // Reset all option selections
        document.querySelectorAll('.option-tag').forEach(tag => {
            tag.classList.remove('selected');
        });
        
        // Clear step 3 input
        const step3Input = document.getElementById('step3Input');
        if (step3Input) {
            step3Input.value = '';
        }
        
        // Return to initial state
        this.goToStep(0);
        
        console.log('Image removed, returned to initial state');
    }


    sendMainChatMessage(customMessage = null) {
        const rightPaneInput = document.getElementById('mainChatInput');
        const floatingInput = document.getElementById('chatInput');
        const candidate = customMessage || (floatingInput && floatingInput.value) || (rightPaneInput && rightPaneInput.value) || '';
        const message = candidate.trim();
        if (message) {
            // Add message to chat results
            this.addMessageToChat(message, 'user');
            if (!customMessage && floatingInput) floatingInput.value = '';
            if (!customMessage && rightPaneInput) rightPaneInput.value = '';
            
            // Send to agent with context if available
            this.sendToAgentWithContext(message);
        }
    }

    getCurrentContext() {
        // Get current context from step selections
        return {
            industry: this.getSelectedOption('chatStep3') || '',
            improve_what: this.getSelectedOption('chatStep4') || 'general',
            optimize_for: this.getSelectedOption('chatStep5') || 'experience'
        };
    }

    async sendToAgentWithContext(message, skipAddToChat = false) {
        try {
            const context = this.getCurrentContext();
            const payload = {
                message: message,
                ...context
            };
            
            // Send to agent using existing chat API
            const response = await fetch(window.AGENT_CFG.CHAT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.supabaseKey}`
                },
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.response) {
                    // Add the response to chat for regular messages (unless skipped)
                    if (!skipAddToChat) {
                        this.addMessageToChat(data.response, 'assistant');
                    }
                    return data.response;
                }
            }
        } catch (error) {
            console.error('Failed to send message to agent:', error);
        }
    }

    addMessageToChat(message, sender, isLoading = false) {
        const chatResultsArea = document.getElementById('chatResultsArea');
        const chatResultsContent = document.getElementById('chatResultsContent');
        const chatState = document.getElementById('chatState');
        
        // Show chat results area and grow the chat component
        chatResultsArea.classList.add('show');
        chatState.classList.add('with-conversation');
        
        // Remove placeholder if it exists
        const placeholder = chatResultsContent.querySelector('.placeholder-text');
        if (placeholder) {
            placeholder.remove();
        }

        // Screen-analysis card format (cards with collapsible justifications)
        if (sender === 'assistant') {
            // 1. FIRST: Try to parse as initial screen analysis (Format A)
            const screenAnalysis = this.parseScreenAnalysis(message);
            if (screenAnalysis.hasScreenAnalysis) {
                this.displayScreenAnalysis(screenAnalysis, chatResultsContent);
                // If a COMMAND is present, mount images silently (no extra bubble)
                if (this.containsCommandFormula(message)) {
                    this.processCommandImagesFromMessage(message, true);
                }
                // Set up event listeners for the new cards
                this.setupCardEventListeners(chatResultsContent);
                return null;
            }
            
            // 2. SECOND: Check if this is a deep-dive response (Format B)
            // Deep-dive responses have rec_id AND steps/state_chart (not summary/recommendations)
            const deepDiveParsed = this.parseDeepDive(message);
            if (deepDiveParsed && deepDiveParsed.deepDive && 
                deepDiveParsed.deepDive.rec_id && 
                (deepDiveParsed.deepDive.steps || deepDiveParsed.deepDive.state_chart)) {
                // This is a deep-dive response - don't show as regular message
                // It should be handled by replaceCardWithDeepDive
                return null;
            }
        }

        // Check for COMMAND formula and process it
        if (sender === 'assistant' && this.containsCommandFormula(message)) {
            this.processCommandMessage(message);
            return null; // Don't add regular message bubble for commands
        }

        // For assistant messages, check if it contains structured content (Solutions/Arguments)
        if (sender === 'assistant' && !isLoading) {
            const structuredContent = this.parseStructuredResponse(message);
            if (structuredContent.hasStructured) {
                this.displayStructuredResponse(structuredContent, chatResultsContent);
                return null;
            }
        }

        // For assistant messages, try to format JSON content if it's raw JSON
        let displayMessage = message;
        if (sender === 'assistant' && !isLoading) {
            try {
                // Try to parse as JSON (either full message or embedded)
                let jsonData = null;
                try {
                    jsonData = JSON.parse(message.trim());
                } catch (e) {
                    const jsonMatch = message.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        jsonData = JSON.parse(jsonMatch[0]);
                    }
                }
                
                if (jsonData) {
                    // Format the JSON nicely for display
                    displayMessage = `<pre style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 12px; line-height: 1.4; white-space: pre-wrap;">${JSON.stringify(jsonData, null, 2)}</pre>`;
                }
            } catch (e) {
                // Not JSON, use original message
                displayMessage = message;
            }
        }

        // Create message element
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${sender}-message`;
        const loadingClass = isLoading ? ' loading' : '';
        messageDiv.innerHTML = `
            <div class="message-content${loadingClass}">${displayMessage}</div>
            <div class="message-time">${new Date().toLocaleTimeString()}</div>
        `;
        
        chatResultsContent.appendChild(messageDiv);
        chatResultsContent.scrollTop = chatResultsContent.scrollHeight;
        
        // Trigger analysis for user messages
        if (sender === 'user') {
            this.triggerAnalysis(message);
        }

        return messageDiv; // Return the message element for potential updates
    }

    async triggerAnalysis(message) {
        try {
            // Show loading message as agent bubble
            const loadingMessage = this.addMessageToChat('Analyzing your request...', 'assistant', true);
            
            // Prepare the message payload
            let msgPayload = message;
            const productTypeSel = this.getSelectedOption('chatStep2');
            const contextPrefix = [
                productTypeSel ? `Product type: ${productTypeSel}` : ''
            ].filter(Boolean).join(', ');
            const userTextFull = contextPrefix ? `${contextPrefix}. ${message}` : message;
            
            // Add image data if available
            if (this.uploadedImageData) {
                msgPayload = [
                    { type: 'text', text: userTextFull },
                    { type: 'image_url', image_url: { url: this.uploadedImageData.dataUrl, detail: 'auto' } }
                ];
            } else {
                msgPayload = userTextFull;
            }
            
            // Call the analysis API
            let response = '';
            // Add user turn to memory prior to call
            this.appendHistory(userTextFull, null);
            let conversationId = null;
            try { conversationId = await this.ensureConversation(); } catch (e) { console.warn('conversation create failed', e); }
            await this.sendChat({
                provider: this.currentProvider,
                model: this.currentModel,
                systemPrompt: this.currentSystemPrompt,
                message: msgPayload,
                history: this.getLastHistory(20),
                conversationId,
                onDelta: (delta, full) => {
                    response = full;
                },
                onDone: async (finalText) => {
                    response = finalText || 'Done';
                }
            });
            
            // Remove the loading message
            if (loadingMessage) {
                loadingMessage.remove();
            }
            
            // Display the response
            if (response) {
                this.addMessageToChat(response, 'assistant');
                this.appendHistory(null, response);
            } else {
                this.addMessageToChat('Sorry, I couldn\'t process your request. Please try again.', 'assistant');
            }
            
        } catch (error) {
            console.error('Analysis error:', error);
            this.addMessageToChat('Sorry, there was an error processing your request. Please try again.', 'assistant');
        }
    }

    handleChatImageUpload(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const imageDataUrl = e.target.result;
            
            // Store the image data for use in the analysis
            this.uploadedImageData = {
                dataUrl: imageDataUrl,
                filename: file.name
            };
            
            // Display the image in the large image area on the left
            this.displayLargeImage(imageDataUrl, file.name);
            
            
            console.log('Image uploaded:', file.name);
        };
        reader.readAsDataURL(file);
    }

    updateChatWithStreamingContent(content, cardId) {
        // For now, just log the streaming content
        // In a real implementation, this would display in a separate results area
        console.log('Streaming content:', content);
    }

    displayResultsInChat(parsedContent, text, cardId) {
        // For now, just log the results
        // In a real implementation, this would display in a separate results area
        console.log('Results:', text);
    }

    async loadSharedSettings() {
        if (!this.supabaseUrl || !this.supabaseKey) return null;
        const url = `${this.supabaseUrl}/rest/v1/app_settings?select=system_prompt,provider,model&key=eq.default`;
        const resp = await fetch(url, {
            method: 'GET',
            headers: {
                'apikey': this.supabaseKey,
                'Authorization': `Bearer ${this.supabaseKey}`,
                'Accept': 'application/json'
            }
        });
        if (!resp.ok) {
            console.warn('loadSharedSettings failed', resp.status);
            return null;
        }
        const rows = await resp.json();
        const row = Array.isArray(rows) ? rows[0] : null;
        return row ? {
            systemPrompt: row.system_prompt || '',
            provider: row.provider || '',
            model: row.model || ''
        } : null;
    }

    appendHistory(userText, assistantText) {
        if (!userText && !assistantText) return;
        if (userText) this.chatMemory.push({ role: 'user', content: userText });
        if (assistantText) this.chatMemory.push({ role: 'assistant', content: assistantText });
        // Keep last 20 messages (10 turns)
        if (this.chatMemory.length > 20) {
            this.chatMemory = this.chatMemory.slice(-20);
        }
    }

    getLastHistory(limit = 20) {
        return this.chatMemory.slice(-limit);
    }

    async sendChat({ provider, model, systemPrompt, message, history, onDelta, onDone, conversationId }) {
        if (!this.chatUrl || !this.supabaseKey) throw new Error('Chat not configured');
        const body = {
            provider,
            model,
            systemPrompt,
            message,
            history: Array.isArray(history) ? history : [],
            conversation_id: conversationId || this.currentConversationId || null
        };
        const authHeader = await this.getAuthHeader();
        // Diagnostics
        try {
            const tokenPreview = (authHeader && authHeader.Authorization) ? String(authHeader.Authorization).slice(0, 24) + '…' : 'none';
            console.debug('[CHAT REQUEST]', { url: this.chatUrl, hasAuth: !!authHeader.Authorization, tokenPreview, hasApikey: !!this.supabaseKey });
        } catch {}
        const resp = await fetch(this.chatUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...authHeader,
                ...(this.supabaseKey ? { 'apikey': this.supabaseKey } : {}),
            },
            body: JSON.stringify(body)
        });
        // Handle non-OK
        if (!resp.ok) {
            let details = '';
            try { details = await resp.text(); } catch {}
            throw new Error(`Chat HTTP ${resp.status}${details ? `: ${details}` : ''}`);
        }
        const ct = resp.headers.get('content-type') || '';
        // If JSON, use non-streaming response
        if (ct.includes('application/json')) {
            try {
                const json = await resp.json();
                const text = json.response || json.content || json.message || '';
                if (onDelta && text) onDelta(text, text);
                if (onDone) onDone(text);
                return text;
            } catch (e) {
                const raw = await resp.text().catch(() => '');
                if (onDelta && raw) onDelta(raw, raw);
                if (onDone) onDone(raw);
                return raw;
            }
        }
        // Otherwise, treat as SSE
        if (!resp.body) {
            if (onDone) onDone('');
            return '';
        }
        const reader = resp.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullText = '';
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\n\n|\n/);
            buffer = lines.pop() || '';
            for (const line of lines) {
                const m = line.match(/^data:\s*(.*)$/);
                if (!m) continue;
                try {
                    const evt = JSON.parse(m[1]);
                    const isDone = evt.type === 'done' || evt.done === true || evt.event === 'done';
                    if (isDone) {
                        if (onDone) onDone(fullText);
                        continue;
                    }
                    const delta = (evt.delta !== undefined ? evt.delta : (evt.content !== undefined ? evt.content : evt.text)) || '';
                    if (typeof delta === 'string') {
                        if (delta) {
                            fullText += delta;
                            if (onDelta) onDelta(delta, fullText);
                        }
                    } else if (delta && Array.isArray(delta)) {
                        const chunk = delta.join('');
                        if (chunk) {
                            fullText += chunk;
                            if (onDelta) onDelta(chunk, fullText);
                        }
                    }
                } catch (_) { }
            }
        }
        if (onDone) onDone(fullText);
        return fullText;
    }

    async getAuthHeader() {
        // Prefer logged-in user JWT; fallback to anon key for public endpoints
        try {
            if (this.supabase) {
                const { data } = await this.supabase.auth.getSession();
                const token = data && data.session ? data.session.access_token : null;
                if (token) {
                    return { 'Authorization': `Bearer ${token}` };
                }
            }
        } catch (_) {}
        // Fallback to anon if available
        if (this.supabaseKey) {
            return { 'Authorization': `Bearer ${this.supabaseKey}` };
        }
        return {};
    }

    async getCurrentUser() {
        if (!this.supabase) return null;
        const { data } = await this.supabase.auth.getUser();
        return data && data.user ? data.user : null;
    }

    async ensureProfile() {
        try {
            const user = await this.getCurrentUser();
            if (!user) return;
            const authHeader = await this.getAuthHeader();
            const resp = await fetch(`${this.chatUrl}/ensure_profile`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeader,
                    ...(this.supabaseKey ? { 'apikey': this.supabaseKey } : {})
                },
                body: JSON.stringify({ user_id: user.id, email: user.email, action: 'ensure_profile' })
            });
            if (!resp.ok) {
                try { console.warn('ensure_profile failed', await resp.text()); } catch {}
            }
        } catch (_) {}
    }

    async ensureConversation() {
        if (this.currentConversationId) return this.currentConversationId;
        const authHeader = await this.getAuthHeader();
        const resp = await fetch(`${this.chatUrl}/conversations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...authHeader,
                ...(this.supabaseKey ? { 'apikey': this.supabaseKey } : {})
            }
        });
        if (!resp.ok) {
            let details = '';
            try { details = await resp.text(); } catch {}
            throw new Error(`Create conversation HTTP ${resp.status}${details ? `: ${details}` : ''}`);
        }
        const data = await resp.json();
        const id = data && data.conversation && data.conversation.id ? data.conversation.id : null;
        if (id) this.currentConversationId = id;
        return id;
    }
    
    // Conversation context management methods
    addToConversationHistory(cardId, message, response, conversationId = null) {
        if (!this.conversationHistory.has(cardId)) {
            this.conversationHistory.set(cardId, []);
        }
        
        const history = this.conversationHistory.get(cardId);
        history.push({
            timestamp: new Date().toISOString(),
            message,
            response,
            conversationId
        });
        
        // Also add to main chat history for centralized tracking
        this.mainChatHistory.push({
            timestamp: new Date().toISOString(),
            cardId,
            message,
            response,
            conversationId
        });
        
        // Update current conversation ID if provided
        if (conversationId) {
            this.currentConversationId = conversationId;
        }
    }
    
    getConversationContext(cardId) {
        const history = this.conversationHistory.get(cardId) || [];
        return history.slice(-5); // Return last 5 interactions for context
    }
    
    isFollowUpQuestion(message) {
        // Simple heuristics to detect follow-up questions
        const followUpIndicators = [
            'what about', 'how about', 'can you', 'could you', 'would you',
            'tell me more', 'explain', 'elaborate', 'clarify', 'expand on',
            'what if', 'instead', 'alternative', 'better', 'improve',
            'why', 'how', 'when', 'where', 'which'
        ];
        
        const lowerMessage = message.toLowerCase();
        return followUpIndicators.some(indicator => lowerMessage.includes(indicator));
    }

    
    
    
    
    setupEventListeners() {
        
        // Paste functionality (global)
        document.addEventListener('paste', (e) => this.handlePaste(e));
        
        // Text selection functionality (global)
        this.setupTextSelection();
        
        // Main floating chat functionality
        this.setupMainChat();
        
        // Debug controls functionality
        this.setupDebugControls();

        // Minimize/restore cards
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.card-minimize-btn');
            if (!btn) return;
            const targetId = btn.getAttribute('data-target');
            const el = document.getElementById(targetId);
            if (!el) return;
            el.classList.toggle('minimized');
        });

        // Training Data Modal
        this.initTrainingDataModal();
        
        // Chat Results Toggle
        this.initChatResultsToggle();
        
        // Chat Back Button
        this.initChatBackButton();
        
        // Image Modal
        this.initImageModal();
    }
    
    setupDebugControls() {
        const debugSegments = document.querySelectorAll('.debug-segment');
        
        debugSegments.forEach(segment => {
            segment.addEventListener('click', () => {
                // Remove active class from all segments
                debugSegments.forEach(s => s.classList.remove('active'));
                
                // Add active class to clicked segment
                segment.classList.add('active');
                
                // Get the state from data attribute
                const state = segment.getAttribute('data-state');
                
                // Set the chat state
                this.setChatState(state);
                
                // If switching to "initial-state-with-tag", add a sample tag
                if (state === 'initial-state-with-tag') {
                    this.addSampleTag();
                } else {
                    // Clear any existing tags
                    const mainChatTags = document.getElementById('mainChatTags');
                    mainChatTags.innerHTML = '';
                }
            });
        });
    }
    
    addSampleTag() {
        const mainChatTags = document.getElementById('mainChatTags');
        mainChatTags.innerHTML = '';
        
        const tagElement = document.createElement('div');
        tagElement.className = 'chat-tag';
        tagElement.innerHTML = `
            <span class="chat-tag-text">Sample tag for debugging</span>
            <button class="chat-tag-remove" data-action="remove-tag">×</button>
        `;
        
        mainChatTags.appendChild(tagElement);
        // Bind removal
        tagElement.addEventListener('click', (e) => {
            const btn = e.target.closest('.chat-tag-remove');
            if (!btn) return;
            tagElement.remove();
            if (btn.getAttribute('data-action') === 'remove-tag-update') {
                this.updateChatStateAfterTagChange();
            }
        });
    }
    
    addImageToMainChat(imageUrl, filename) {
        const mainChatTags = document.getElementById('mainChatTags');
        const floatingChat = document.getElementById('floatingChat');
        
        // Create image tag element
        const tagElement = document.createElement('div');
        tagElement.className = 'chat-tag';
        tagElement.innerHTML = `
            <span class="chat-tag-text">📷 ${filename}</span>
            <button class="chat-tag-remove" data-action="remove-tag-update">×</button>
        `;
        
        // Store image data in the tag for later use
        tagElement.dataset.imageUrl = imageUrl;
        tagElement.dataset.filename = filename;
        
        mainChatTags.appendChild(tagElement);
        
        // Update chat state to show tags
        this.updateChatStateAfterTagChange();
        
        // Expand main chat if it's collapsed
        if (floatingChat.classList.contains('collapsed-state')) {
            this.setChatState('expanded-state');
        }
    }
    
    setupMainChat() {
        const mainChatInput = document.getElementById('chatInput');
        const mainSendBtn = document.getElementById('sendBtn');
        const historyBtn = document.getElementById('historyBtn');
        const chatToggleBtn = document.getElementById('chatToggleBtn');
        const chatCloseBtn = document.getElementById('chatCloseBtn');
        const floatingChat = document.getElementById('floatingChat');
        
        // Send message on button click
        mainSendBtn.addEventListener('click', () => {
            this.sendMainChatMessage();
        });
        
        // Show history on button click
        if (historyBtn) {
            historyBtn.addEventListener('click', () => {
                console.log('History button clicked');
                this.showMainChatHistory();
            });
        } else {
            console.log('History button not found');
        }
        
        // Send message on Enter key
        mainChatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMainChatMessage();
            }
        });
        
        // Toggle chat collapse/expand
        chatToggleBtn.addEventListener('click', () => {
            this.toggleMainChat();
        });

        // Close chat (does not clear history)
        chatCloseBtn.addEventListener('click', () => {
            floatingChat.style.display = 'none';
        });
        
        // Initialize chat in initial state and show conversation list after auth resolves
        this.setChatState('initial-state');
        try {
            if (this.supabase) {
                this.supabase.auth.getSession().then(() => this.renderConversationList()).catch(() => this.renderConversationList());
            } else {
                this.renderConversationList();
            }
        } catch (_) { this.renderConversationList(); }
        
    }

    async fetchConversationsForUser() {
        try {
            const authHeader = await this.getAuthHeader();
            const user = await this.getCurrentUser();
            if (!user) return [];
            const url = `${this.supabaseUrl}/rest/v1/conversations?select=id,title,created_at&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc`;
            const resp = await fetch(url, {
                headers: { 'apikey': this.supabaseKey, 'Accept': 'application/json', ...authHeader }
            });
            if (!resp.ok) { console.warn('fetchConversations 400+', resp.status, await resp.text().catch(()=>'')); return [];} 
            return await resp.json();
        } catch (_) { return []; }
    }

    async fetchMessages(conversationId) {
        try {
            const authHeader = await this.getAuthHeader();
            const url = `${this.supabaseUrl}/rest/v1/messages?select=role,content,created_at&conversation_id=eq.${encodeURIComponent(conversationId)}&order=created_at.asc`;
            const resp = await fetch(url, {
                headers: { 'apikey': this.supabaseKey, 'Accept': 'application/json', ...authHeader }
            });
            if (!resp.ok) { console.warn('fetchMessages 400+', resp.status, await resp.text().catch(()=>'')); return [];}
            return await resp.json();
        } catch (_) { return []; }
    }

    async renderConversationList() {
        const chatResultsArea = document.getElementById('chatResultsArea');
        const chatResultsContent = document.getElementById('chatResultsContent');
        const chatResultsTitle = document.getElementById('chatResultsTitle');
        
        // Set title for conversation list
        chatResultsTitle.textContent = 'Spaces';
        
        chatResultsArea.classList.add('show');
        this.setChatState('expanded-state');
        chatResultsContent.innerHTML = `<div class="message-content" id="convLoading">Loading conversations…</div>`;
        const list = await this.fetchConversationsForUser();
        this.conversationsList = Array.isArray(list) ? list : [];
        // Group by date (YYYY-MM-DD)
        const byDate = {};
        for (const c of this.conversationsList) {
            const d = new Date(c.created_at);
            const key = isNaN(d.getTime()) ? 'Unknown date' : d.toLocaleDateString();
            if (!byDate[key]) byDate[key] = [];
            byDate[key].push(c);
        }
        const sections = Object.keys(byDate).map(dateKey => {
            const itemsHtml = byDate[dateKey].map(c => {
                const created = new Date(c.created_at);
                const fallbackTitle = isNaN(created.getTime()) ? 'Conversation' : created.toLocaleString();
                const title = (c.title && c.title !== 'New conversation') ? c.title : fallbackTitle;
                return `
                <div class=\"conversation-card\" data-role=\"open-conv\" data-id=\"${c.id}\">\n                    <div class=\"conversation-header\">\n                        <div class=\"conversation-title\">${this.escapeHtml(title)}</div>\n                    </div>\n                </div>`;
            }).join('');
            return `<div class=\"message-content\"><strong>${this.escapeHtml(dateKey)}</strong></div>${itemsHtml}`;
        }).join('');
        // Hide chat results area if no conversations
        if (!sections) {
            chatResultsArea.classList.remove('show');
            return;
        }
        
        chatResultsContent.innerHTML = `
            <div class="cards-stack">${sections}</div>
        `;
        chatResultsContent.addEventListener('click', async (e) => {
            const item = e.target.closest('[data-role="open-conv"]');
            if (!item) return;
            const id = item.getAttribute('data-id');
            await this.openConversation(id);
        }, { once: true });
    }

    async openConversation(conversationId) {
        this.currentConversationId = conversationId;
        const chatResultsArea = document.getElementById('chatResultsArea');
        const chatResultsContent = document.getElementById('chatResultsContent');
        const chatResultsTitle = document.getElementById('chatResultsTitle');
        
        // Ensure chat results area is shown and set loading state
        chatResultsArea.classList.add('show');
        chatResultsTitle.textContent = 'Loading...';
        chatResultsContent.innerHTML = `<div class="message-content">Loading messages…</div>`;
        
        const messages = await this.fetchMessages(conversationId);
        
        // Set the actual conversation title (you can customize this based on your data structure)
        const conversationTitle = this.getConversationTitle(conversationId);
        chatResultsTitle.textContent = conversationTitle || 'Conversation';
        
        // Clear content completely and start fresh
        chatResultsContent.innerHTML = '';
        
        let html = '';
        const urlRegex = /(https?:[^\s]+\.(?:png|jpe?g|gif|webp)|data:image\/[^;]+;base64,[^\s]+)/ig;
        const extractText = (val) => {
            if (val == null) return '';
            if (typeof val === 'string') {
                const s = val.trim();
                if ((s.startsWith('{') || s.startsWith('['))) {
                    try { return extractText(JSON.parse(s)); } catch { return s; }
                }
                return s;
            }
            if (Array.isArray(val)) return val.map(extractText).filter(Boolean).join('\n');
            if (typeof val === 'object') {
                const keys = ['text','content','message','value','delta'];
                let acc = '';
                for (const k of keys) {
                    if (val[k] !== undefined) {
                        const part = extractText(val[k]);
                        if (part) acc += (acc ? '\n' : '') + part;
                    }
                }
                if (!acc) {
                    for (const k in val) {
                        const part = extractText(val[k]);
                        if (part) acc += (acc ? '\n' : '') + part;
                    }
                }
                return acc;
            }
            return '';
        };

        (messages || []).forEach((m) => {
            const role = (m.role && typeof m.role === 'string') ? m.role : (m.author || 'assistant');
            let content = extractText(m.content);
            // Collect all image urls, show them, and strip from text
            const urls = [];
            let match;
            const copy = content || '';
            urlRegex.lastIndex = 0;
            while ((match = urlRegex.exec(copy)) !== null) { urls.push(match[0]); }
            urls.forEach((url) => {
                try { this.addImageToMainChat(url, 'User design'); } catch {}
                try { this.displayLargeImage(url, 'User design'); } catch {}
                content = content.replace(url, '[User design]');
            });
            content = (content || '').trim();
            // If assistant message contains COMMAND formula, process inspirations for old conversations
            if (role === 'assistant' && this.containsCommandFormula(content)) {
                try { this.processCommandImagesFromMessage(content, true); } catch {}
            }
            if (!content) return;
            
            if (role === 'assistant') {
                // Try to parse as screen analysis for cards
                const screenAnalysis = this.parseScreenAnalysis(content);
                if (screenAnalysis.hasScreenAnalysis) {
                    // Create a temporary div to render cards
                    const tempDiv = document.createElement('div');
                    this.displayScreenAnalysis(screenAnalysis, tempDiv);
                    html += tempDiv.innerHTML;
                } else {
                    // Fallback to regular message
                    html += `\n            <div class="chat-message ${role === 'user' ? 'user-message' : 'assistant-message'}">\n                <div class="message-content">${this.escapeHtml(content)}</div>\n            </div>`;
                }
            } else {
                // User messages stay as regular bubbles
                html += `\n            <div class="chat-message ${role === 'user' ? 'user-message' : 'assistant-message'}">\n                <div class="message-content">${this.escapeHtml(content)}</div>\n            </div>`;
            }
        });
        chatResultsContent.innerHTML = html;
        
        // Apply slide-in animation to the conversation content
        // Use requestAnimationFrame to ensure DOM is updated before animation
        requestAnimationFrame(() => {
            chatResultsContent.classList.add('conversation-slide-in');
            
            // Remove animation class after animation completes to allow re-animation on next entry
            setTimeout(() => {
                chatResultsContent.classList.remove('conversation-slide-in');
            }, 400); // Match the animation duration (0.4s)
        });
        
        // Set up event listeners for cards (Go deeper buttons and chevron toggles)
        const updatedContainer = this.setupCardEventListeners(chatResultsContent);
        
        // Back handler is now in the header - handled by initChatBackButton
        // No extra design fetch here; image urls in messages will have restored the image already
    }
    
    setupCardEventListeners(container) {
        // Check if event listeners are already set up to avoid duplicates
        if (container.hasAttribute('data-card-listeners-setup')) {
            return container;
        }
        
        // Use event delegation on the container to handle all card interactions
        container.addEventListener('click', (e) => {
            const chevron = e.target.closest('.improvement-chevron');
            if (chevron) {
                const card = chevron.closest('.improvement-card');
                if (card) card.classList.toggle('expanded');
            }
            const goDeeper = e.target.closest('[data-role="go-deeper"]');
            if (goDeeper) {
                const card = goDeeper.closest('.improvement-card');
                if (card) {
                    const titleEl = card.querySelector('.improvement-title');
                    const bodyEl = card.querySelector('.improvement-body');
                    const title = titleEl ? titleEl.textContent.trim() : '';
                    const body = bodyEl ? bodyEl.textContent.trim() : '';
                    const prompt = `${title}\n\n${body}\n\nTell me more about this.`;
                    this.sendMainChatMessage(prompt);
                }
            }
        });
        
        // Mark that event listeners are set up
        container.setAttribute('data-card-listeners-setup', 'true');
        
        return container;
    }
    
    setChatState(state) {
        const floatingChat = document.getElementById('floatingChat');
        
        // Remove all state classes
        floatingChat.classList.remove('initial-state', 'initial-state-with-tag', 'expanded-state', 'collapsed-state');
        
        // Add the new state class
        floatingChat.classList.add(state);
    }
    
    toggleMainChat() {
        const floatingChat = document.getElementById('floatingChat');
        
        if (floatingChat.classList.contains('collapsed-state')) {
            this.setChatState('expanded-state');
        } else {
            this.setChatState('collapsed-state');
        }
    }
    
    
    
    showMainChatResults(text) {
        const chatResultsContent = document.getElementById('chatResultsContent');
        
        // Try to parse and format the text into different card types
        const parsedContent = this.parseDustOutput(text);
        
        if (parsedContent.cards && parsedContent.cards.length > 0) {
            // Render structured cards
            chatResultsContent.innerHTML = this.renderStructuredCards(parsedContent.cards);
        } else {
            // Fallback to plain text display
            chatResultsContent.textContent = text;
        }
    }
    
    showMainChatError(message) {
        const chatResultsContent = document.getElementById('chatResultsContent');
        chatResultsContent.textContent = `Error: ${message}`;
        this.setChatState('expanded-state');
    }
    
    // Display centralized conversation summary in main chat
    showMainChatHistory() {
        const chatResultsArea = document.getElementById('chatResultsArea');
        const chatResultsContent = document.getElementById('chatResultsContent');
        if (!chatResultsContent || this.mainChatHistory.length === 0) {
            // Hide chat results area if no history
            if (chatResultsArea) {
                chatResultsArea.classList.remove('show');
            }
            return;
        }
        
        const historyHTML = this.mainChatHistory.map(entry => `
            <div class="chat-message user-message">
                <div class="message-header">
                    <span class="message-sender">You</span>
                    <span class="message-time">${new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
                <div class="message-content">${this.formatContent(entry.message)}</div>
            </div>
            <div class="chat-message agent-message">
                <div class="message-header">
                    <span class="message-sender">AI</span>
                    <span class="message-time">${new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
                <div class="message-content">${this.formatContent(entry.response)}</div>
            </div>
        `).join('');
        
        // Show chat results area for history
        chatResultsArea.classList.add('show');
        
        chatResultsContent.innerHTML = `
            <div class="chat-history-container">
                <h3>Conversation History</h3>
                <div class="chat-history-content">
                    ${historyHTML}
                </div>
            </div>
        `;
    }
    
    findMostRecentCardWithImages() {
        // Find the card with the highest ID that has images
        let mostRecentCardId = null;
        let highestId = 0;
        
        for (const [cardId, cardData] of this.cardData.entries()) {
            const hasImages = Object.keys(cardData.uploadedImages).length > 0;
            if (hasImages && parseInt(cardId) > highestId) {
                highestId = parseInt(cardId);
                mostRecentCardId = cardId;
            }
        }
        
        return mostRecentCardId;
    }
    
    setupTextSelection() {
        const floatingBtn = document.getElementById('selectionFloatingBtn');
        let currentSelection = '';
        let currentCardId = null;
        
        // Handle text selection
        document.addEventListener('mouseup', (e) => {
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();
            
            if (selectedText && selectedText.length > 0) {
                // Check if selection is within a results container (upload cards) or main chat results
                const resultsContainer = e.target.closest('.results-content');
                const chatResultsContainer = e.target.closest('.chat-results-content');
                
                if (resultsContainer) {
                    const cardId = resultsContainer.id.match(/resultsContent-(\d+)/)?.[1];
                    if (cardId) {
                        currentSelection = selectedText;
                        currentCardId = cardId;
                        this.showFloatingButton(e, floatingBtn);
                    }
                } else if (chatResultsContainer) {
                    // Selection is in main chat results
                    currentSelection = selectedText;
                    currentCardId = 'main-chat';
                    this.showFloatingButton(e, floatingBtn);
                } else {
                    this.hideFloatingButton(floatingBtn);
                }
            } else {
                this.hideFloatingButton(floatingBtn);
            }
        });
        
        // Handle floating button click
        floatingBtn.addEventListener('click', () => {
            if (currentSelection && currentCardId) {
                if (currentCardId === 'main') {
                    // Add to main chat tags
                    this.addTagToMainChat(currentSelection);
                } else {
                    // Add to container chat tags
                    this.addTagToChat(currentCardId, currentSelection);
                }
                this.hideFloatingButton(floatingBtn);
                // Clear selection
                window.getSelection().removeAllRanges();
            }
        });
        
        // Hide button when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.results-content') && 
                !e.target.closest('.chat-results-content') && 
                !e.target.closest('.selection-floating-btn')) {
                this.hideFloatingButton(floatingBtn);
            }
        });
    }
    
    showFloatingButton(e, floatingBtn) {
        const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
        floatingBtn.style.display = 'block';
        floatingBtn.style.left = `${rect.left + rect.width / 2 - 40}px`;
        floatingBtn.style.top = `${rect.top - 40}px`;
    }
    
    hideFloatingButton(floatingBtn) {
        floatingBtn.style.display = 'none';
    }
    
    addTagToChat(cardId, text) {
        const chatTags = document.getElementById(`chatTags-${cardId}`);
        if (!chatTags) return;

        // Get the full context where the text was selected from
        const fullContext = this.getFullContextFromSelection(text);
        
        const tagElement = document.createElement('div');
        tagElement.className = 'chat-tag';
        tagElement.innerHTML = `
            <span class="chat-tag-text">${this.escapeHtml(text)}</span>
            <button class="chat-tag-remove" title="Remove">×</button>
        `;

        // Store the full context for later use
        if (fullContext) {
            tagElement.dataset.fullContext = fullContext;
            tagElement.dataset.isAnswerSelection = 'true';
        }

        tagElement.querySelector('.chat-tag-remove').addEventListener('click', () => {
            tagElement.remove();
        });

        chatTags.appendChild(tagElement);
    }
    
    addTagToMainChat(text) {
        const mainChatTags = document.getElementById('mainChatTags');
        if (!mainChatTags) return;

        // Get the full context where the text was selected from
        const fullContext = this.getFullContextFromSelection(text);
        
        const tagElement = document.createElement('div');
        tagElement.className = 'chat-tag';
        tagElement.innerHTML = `
            <span class="chat-tag-text">${this.escapeHtml(text)}</span>
            <button class="chat-tag-remove" title="Remove">×</button>
        `;

        // Store the full context for later use
        if (fullContext) {
            tagElement.dataset.fullContext = fullContext;
            tagElement.dataset.isAnswerSelection = 'true';
        }

        tagElement.querySelector('.chat-tag-remove').addEventListener('click', () => {
            tagElement.remove();
            this.updateChatStateAfterTagChange();
        });

        mainChatTags.appendChild(tagElement);
        this.updateChatStateAfterTagChange();
    }
    
    // Get full context from the selected text
    getFullContextFromSelection(selectedText) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return null;
        
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        
        // Find the closest content container
        let contentContainer = container.closest('.dust-card__text') || 
                             container.closest('.dust-card__content') ||
                             container.closest('.feedback-content') ||
                             container.closest('.chat-message .message-content');
        
        if (contentContainer) {
            // Get the full text content, removing HTML tags
            const fullText = contentContainer.textContent || contentContainer.innerText || '';
            return fullText.trim();
        }
        
        return null;
    }
    
    updateChatStateAfterTagChange() {
        const mainChatTags = document.getElementById('mainChatTags');
        const floatingChat = document.getElementById('floatingChat');
        const hasTags = mainChatTags.children.length > 0;
        
        if (floatingChat.classList.contains('initial-state')) {
            if (hasTags) {
                this.setChatState('initial-state-with-tag');
            }
        } else if (floatingChat.classList.contains('initial-state-with-tag')) {
            if (!hasTags) {
                this.setChatState('initial-state');
            }
        }
    }
    
    handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
    }
    
    handleDragLeave(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
    }
    
    handleDrop(e, cardId, zoneId) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            this.processFiles(files, cardId, zoneId);
        }
    }
    
    handleFileUpload(e, cardId, zoneId) {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            this.processFiles(files, cardId, zoneId);
        }
        e.target.value = ''; // Reset input
    }
    
    handlePaste(e) {
        const items = e.clipboardData.items;
        
        for (let item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                    // Find the most recent card and first empty zone for paste
                    const mostRecentCardId = this.currentCardId;
                    const cardData = this.cardData.get(mostRecentCardId);
                    
                    // Find first empty zone
                    for (let i = 1; i <= 3; i++) {
                        if (!cardData.uploadedImages[i]) {
                            this.processFiles([file], mostRecentCardId, i);
                            break;
                        }
                    }
                }
                break;
            }
        }
    }
    
    processFiles(files, cardId, zoneId) {
        const imageFiles = files.filter(file => file.type.startsWith('image/'));
        
        if (imageFiles.length === 0) {
            this.showError('Please select image files only.', cardId);
            return;
        }
        
        // Take only the first image for this specific zone
        const file = imageFiles[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            this.addImage(e.target.result, file.name, cardId, zoneId);
        };
        reader.readAsDataURL(file);
    }
    
    
    
    
    
    
    // analyzeDesign is now replaced by sendChat usage inside callers
    
    showResultsContainer(cardId) {
        // Results are now displayed in chat area, so this method is no longer needed
        // Keeping for compatibility but not showing results container
        const uploadCard = document.getElementById(`card-${cardId}`);
        uploadCard.classList.add('with-results');
        uploadCard.classList.remove('without-results');
    }
    
    // Display chat history for a specific card
    showCardChatHistory(cardId) {
        const chatHistoryContent = document.getElementById(`chatHistoryContent-${cardId}`);
        if (!chatHistoryContent) return;
        
        const history = this.conversationHistory.get(cardId) || [];
        if (history.length === 0) {
            chatHistoryContent.innerHTML = '<div class="placeholder-text">No conversation yet</div>';
            return;
        }
        
        const historyHTML = history.map(entry => `
            <div class="chat-message user-message">
                <div class="message-header">
                    <span class="message-sender">You</span>
                    <span class="message-time">${new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
                <div class="message-content">${this.formatContent(entry.message)}</div>
            </div>
            <div class="chat-message agent-message">
                <div class="message-header">
                    <span class="message-sender">AI</span>
                    <span class="message-time">${new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
                <div class="message-content">${this.formatContent(entry.response)}</div>
            </div>
        `).join('');
        
        chatHistoryContent.innerHTML = historyHTML;
        
        // Scroll to bottom
        chatHistoryContent.scrollTop = chatHistoryContent.scrollHeight;
    }
    
    showResults(text, cardId) {
        const resultsContent = document.getElementById(`resultsContent-${cardId}`);
        
        // Try to parse and format the text into different card types
        const parsedContent = this.parseDustOutput(text);
        
        // Display results in chat area instead of results container
        this.displayResultsInChat(parsedContent, text, cardId);
        
        // Update chat history for this card
        this.showCardChatHistory(cardId);
    }
    
    showFeedbackCard() {
        const feedbackCard = document.getElementById('feedbackCard');
        feedbackCard.classList.add('visible');
    }
    
    showFeedback(text) {
        const feedbackContent = document.getElementById('feedbackContent');
        
        // Try to parse and format the text into different card types
        const parsedContent = this.parseDustOutput(text);
        
        if (parsedContent.cards && parsedContent.cards.length > 0) {
            // Render structured cards
            feedbackContent.innerHTML = this.renderStructuredCards(parsedContent.cards);
        } else {
            // Fallback to plain text display
            feedbackContent.innerHTML = `<div class="feedback-text">${text}</div>`;
        }
    }
    
    // Parse Dust output into structured content
    parseDustOutput(text) {
        const cards = [];
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        let currentCard = null;
        let currentContent = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Look for Business, Experience, or Solution headers
            if (this.isBusinessOrExperienceHeader(line)) {
                // Save previous card if exists
                if (currentCard) {
                    currentCard.content = currentContent.join('\n').trim();
                    cards.push(currentCard);
                }
                
                // Start new card
                currentCard = {
                    type: this.detectBusinessOrExperienceType(line),
                    title: this.extractCardTitle(line),
                    content: '',
                    arguments: []
                };
                currentContent = [];
            } else if (currentCard) {
                // Check if this line is a solution (Solution 1, Solution 2, etc.)
                if (this.isSolutionLine(line)) {
                    // Add solution to current card content
                    currentContent.push(line);
                } else {
                    currentContent.push(line);
                }
            }
        }
        
        // Save the last card
        if (currentCard) {
            currentCard.content = currentContent.join('\n').trim();
            // Parse arguments within the card
            currentCard.arguments = this.parseArgumentsInCard(currentCard);
            cards.push(currentCard);
        }
        
        
        return { cards };
    }
    
    // Parse arguments within a card and create individual argument objects
    parseArgumentsInCard(card) {
        const argumentList = [];
        const lines = card.content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        console.log(`Parsing arguments for card: ${card.title}`);
        console.log('Card content lines:', lines);
        
        let currentMainArgument = null;
        let currentMainArgumentContent = [];
        
        for (const line of lines) {
            console.log(`Checking line: "${line}"`);
            console.log(`Is argument line: ${this.isArgumentLine(line)}`);
            console.log(`Is sub-argument line: ${this.isSubArgumentLine(line)}`);
            
            // Check if this line starts a new main argument (like **Header**:)
            if (this.isArgumentLine(line) && line.includes('**') && line.includes(':')) {
                // Save previous main argument if exists
                if (currentMainArgument) {
                    currentMainArgument.content = currentMainArgumentContent.join('\n').trim();
                    argumentList.push(currentMainArgument);
                }
                
                // Start new main argument
                currentMainArgument = {
                    type: this.detectArgumentType(line),
                    title: this.extractArgumentTitle(line),
                    content: line,
                    parentCard: card.title
                };
                currentMainArgumentContent = [line];
                console.log(`Started new main argument: ${currentMainArgument.title}`);
            }
            // Check if this line is a sub-argument (like 🟢 Good: or 🔴 Issue:)
            else if (this.isSubArgumentLine(line)) {
                // Create individual argument for each emoji line
                const subArgument = {
                    type: this.detectArgumentType(line),
                    title: this.extractArgumentTitle(line),
                    content: line,
                    parentCard: card.title
                };
                argumentList.push(subArgument);
                console.log(`Created sub-argument: ${subArgument.title}`);
            }
            // Add content to current main argument
            else if (currentMainArgument) {
                currentMainArgumentContent.push(line);
            }
        }
        
        // Save the last main argument
        if (currentMainArgument) {
            currentMainArgument.content = currentMainArgumentContent.join('\n').trim();
            argumentList.push(currentMainArgument);
        }
        
        console.log(`Parsed ${argumentList.length} arguments for card: ${card.title}`, argumentList);
        return argumentList;
    }
    
    // Check if a line is an argument line (starts with * at any indentation level)
    isArgumentLine(line) {
        // Match lines that start with * followed by either **Title**: or emoji patterns
        return /^\s*\*\s*(\*\*.*\*\*:|[🟢🔴🟡⚪🟠🟣🟤⚫✅❌⚠️💡📋🎯🔍📊📈📉💰🎨🎭🎪🎨🎯🎲🎳🎴🎵🎶🎸🎹🎺🎻🎼🎽🎾🎿🏀🏁🏂🏃🏄🏅🏆🏇🏈🏉🏊🏋🏌🏍🏎🏏🏐🏑🏒🏓🏔🏕🏖🏗🏘🏙🏚🏛🏜🏝🏞🏟🏠🏡🏢🏣🏤🏥🏦🏧🏨🏩🏪🏫🏬🏭🏮🏯🏰🏱🏲🏳🏴🏵🏶🏷🏸🏹🏺🏻🏼🏽🏾🏿])/.test(line);
    }
    
    // Check if a line is a sub-argument line (starts with * and contains emoji)
    isSubArgumentLine(line) {
        // Match lines that start with * and contain emoji patterns (like 🟢 Good:, 🔴 Issue:)
        return /^\s*\*\s*[🟢🔴🟡⚪🟠🟣🟤⚫✅❌⚠️💡📋🎯🔍📊📈📉💰🎨🎭🎪🎨🎯🎲🎳🎴🎵🎶🎸🎹🎺🎻🎼🎽🎾🎿🏀🏁🏂🏃🏄🏅🏆🏇🏈🏉🏊🏋🏌🏍🏎🏏🏐🏑🏒🏓🏔🏕🏖🏗🏘🏙🏚🏛🏜🏝🏞🏟🏠🏡🏢🏣🏤🏥🏦🏧🏨🏩🏪🏫🏬🏭🏮🏯🏰🏱🏲🏳🏴🏵🏶🏷🏸🏹🏺🏻🏼🏽🏾🏿]/.test(line);
    }
    
    // Detect argument type based on content
    detectArgumentType(line) {
        if (line.includes('🟢') || line.includes('Good:')) {
            return 'positive';
        } else if (line.includes('🔴') || line.includes('Issue:')) {
            return 'negative';
        } else if (line.includes('✅') || line.includes('Solution')) {
            return 'suggestion';
        } else if (line.includes('**') && line.includes(':')) {
            // This is a main argument header (like **Profile Gallery**:)
            return 'neutral';
            } else {
            return 'neutral';
        }
    }
    
    // Extract clean title from argument line
    extractArgumentTitle(line) {
        // Remove the * and clean up the title, handling any indentation
        let title = line
            .replace(/^\s*\*\s*/, '')
            .trim();
        
        // Handle **Title**: format
        if (title.includes('**') && title.includes(':')) {
            title = title.replace(/\*\*(.*?)\*\*:.*/, '$1').trim();
        }
        // Handle emoji patterns
        else if (/^[🟢🔴🟡⚪🟠🟣🟤⚫✅❌⚠️💡📋🎯🔍📊📈📉💰🎨🎭🎪🎨🎯🎲🎳🎴🎵🎶🎸🎹🎺🎻🎼🎽🎾🎿🏀🏁🏂🏃🏄🏅🏆🏇🏈🏉🏊🏋🏌🏍🏎🏏🏐🏑🏒🏓🏔🏕🏖🏗🏘🏙🏚🏛🏜🏝🏞🏟🏠🏡🏢🏣🏤🏥🏦🏧🏨🏩🏪🏫🏬🏭🏮🏯🏰🏱🏲🏳🏴🏵🏶🏷🏸🏹🏺🏻🏼🏽🏾🏿]/.test(title)) {
            title = title.replace(/^[🟢🔴🟡⚪🟠🟣🟤⚫✅❌⚠️💡📋🎯🔍📊📈📉💰🎨🎭🎪🎨🎯🎲🎳🎴🎵🎶🎸🎹🎺🎻🎼🎽🎾🎿🏀🏁🏂🏃🏄🏅🏆🏇🏈🏉🏊🏋🏌🏍🏎🏏🏐🏑🏒🏓🏔🏕🏖🏗🏘🏙🏚🏛🏜🏝🏞🏟🏠🏡🏢🏣🏤🏥🏦🏧🏨🏩🏪🏫🏬🏭🏮🏯🏰🏱🏲🏳🏴🏵🏶🏷🏸🏹🏺🏻🏼🏽🏾🏿]\s*/, '')
                .replace(/^:\s*/, '')
                .trim();
        }
        
        return title;
    }
    
    // Detect if a line is a solution line (Solution 1, Solution 2, etc.)
    isSolutionLine(line) {
        const solutionPatterns = [
            /^✅\s*\*\*Solution\s*[12]/i,
            /^Solution\s*[12]\s*:/i,
            /^•\s*Solution\s*[12]/i,
            /^-\s*Solution\s*[12]/i,
            /^\d+\.\s*Solution\s*[12]/i
        ];
        
        return solutionPatterns.some(pattern => pattern.test(line));
    }

    // Detect if a line is a Business, Experience, or Solution header
    isBusinessOrExperienceHeader(line) {
        const businessPatterns = [
            /^#+\s*Business/i,
            /^Business\s*:?/i,
            /^•\s*Business/i,
            /^-\s*Business/i,
            /^\d+\.\s*Business/i,
            /⭐️\s*\*\*Business/i,
            /Business\s*:\s*\d+\/\d+/i
        ];
        
        const experiencePatterns = [
            /^#+\s*Experience/i,
            /^Experience\s*:?/i,
            /^•\s*Experience/i,
            /^-\s*Experience/i,
            /^\d+\.\s*Experience/i,
            /⭐️\s*\*\*Experience/i,
            /Experience\s*:\s*\d+\/\d+/i
        ];
        
        const solutionPatterns = [
            /Most\s+impactful\s+improvement/i
        ];
        
        return businessPatterns.some(pattern => pattern.test(line)) || 
               experiencePatterns.some(pattern => pattern.test(line)) ||
               solutionPatterns.some(pattern => pattern.test(line));
    }
    
    // Detect card type based on Business, Experience, or Solution header
    detectBusinessOrExperienceType(header) {
        const lowerHeader = header.toLowerCase();
        
        if (lowerHeader.includes('business')) {
            return 'business';
        } else if (lowerHeader.includes('experience')) {
            return 'experience';
        } else if (lowerHeader.includes('solution 1')) {
            return 'solution1';
        } else if (lowerHeader.includes('solution 2')) {
            return 'solution2';
        } else if (lowerHeader.includes('most impactful improvement')) {
            return 'solutions'; // Single solutions card for "Most impactful improvement"
            } else {
            return 'general';
        }
    }
    
    // Extract clean title from header
    extractCardTitle(header) {
        return header
            .replace(/^#{1,3}\s+/, '')  // Remove markdown headers
            .replace(/^[•\-]\s+/, '')   // Remove bullet points
            .replace(/^\d+\.\s+/, '')   // Remove numbers
            .replace(/:$/, '')          // Remove trailing colon
            .replace(/\*\*(.*?)\*\*/g, '$1')  // Remove ** from titles
            .trim();
    }
    
    // Render structured cards
    renderStructuredCards(cards) {
        const html = cards.map(card => this.renderCard(card)).join('');
        
        // Add event listeners after a short delay to ensure DOM is updated
        setTimeout(() => {
            this.addButtonEventListeners();
        }, 100);
        
        return html;
    }
    
    // Render individual card
    renderCard(card) {
        switch (card.type) {
            case 'business':
                return this.renderBusinessCard(card);
            case 'experience':
                return this.renderExperienceCard(card);
            case 'solutions':
                return this.renderSolutionsCard(card);
            case 'solution1':
                return this.renderSolution1Card(card);
            case 'solution2':
                return this.renderSolution2Card(card);
            default:
                return this.renderGeneralCard(card);
        }
    }
    
    // Render business card
    renderBusinessCard(card) {
        const argumentsHtml = card.arguments && card.arguments.length > 0 
            ? card.arguments.map(arg => this.renderArgumentCard(arg)).join('')
            : '';
        
        return `
            <div class="dust-card dust-card--business" data-card-type="business" data-card-content="${this.escapeHtml(card.content)}">
                <div class="dust-card__header">
                    <h3 class="dust-card__title">${card.title}</h3>
                </div>
                <div class="dust-card__content">
                    <div class="dust-card__text">${this.formatContent(card.content)}</div>
                    ${argumentsHtml ? `<div class="dust-card__arguments">${argumentsHtml}</div>` : ''}
                </div>
                <button class="dust-card__add-to-chat" data-card-type="${card.type}" data-card-content="${this.escapeHtml(card.content)}">
                    Tag in chat
                </button>
            </div>
        `;
    }
    
    // Render experience card
    renderExperienceCard(card) {
        const argumentsHtml = card.arguments && card.arguments.length > 0 
            ? card.arguments.map(arg => this.renderArgumentCard(arg)).join('')
            : '';
        
        return `
            <div class="dust-card dust-card--experience" data-card-type="experience" data-card-content="${this.escapeHtml(card.content)}">
                <div class="dust-card__header">
                    <h3 class="dust-card__title">${card.title}</h3>
                        </div>
                <div class="dust-card__content">
                    <div class="dust-card__text">${this.formatContent(card.content)}</div>
                    ${argumentsHtml ? `<div class="dust-card__arguments">${argumentsHtml}</div>` : ''}
                </div>
                <button class="dust-card__add-to-chat" data-card-type="${card.type}" data-card-content="${this.escapeHtml(card.content)}">
                    Tag in chat
                </button>
                    </div>
                `;
    }
    
    // Render solution 1 card
    renderSolution1Card(card) {
        return `
            <div class="dust-card dust-card--solution1" data-card-type="solution1" data-card-content="${this.escapeHtml(card.content)}">
                <div class="dust-card__header">
                    <h3 class="dust-card__title">${card.title}</h3>
                </div>
                <div class="dust-card__content">
                    <div class="dust-card__text">${this.formatContent(card.content)}</div>
                </div>
                <button class="dust-card__add-to-chat" data-card-type="${card.type}" data-card-content="${this.escapeHtml(card.content)}">
                    Tag in chat
                </button>
            </div>
        `;
    }
    
    // Render solutions card (combined solutions)
    renderSolutionsCard(card) {
        return `
            <div class="dust-card dust-card--solutions" data-card-type="solutions" data-card-content="${this.escapeHtml(card.content)}">
                <div class="dust-card__header">
                    <h3 class="dust-card__title">${card.title}</h3>
                </div>
                <div class="dust-card__content">
                    <div class="dust-card__text">${this.formatContent(card.content)}</div>
                </div>
                <button class="dust-card__add-to-chat" data-card-type="${card.type}" data-card-content="${this.escapeHtml(card.content)}">
                    Tag in chat
                </button>
            </div>
        `;
    }
    
    // Render solution 2 card
    renderSolution2Card(card) {
        return `
            <div class="dust-card dust-card--solution2" data-card-type="solution2" data-card-content="${this.escapeHtml(card.content)}">
                <div class="dust-card__header">
                    <h3 class="dust-card__title">${card.title}</h3>
                </div>
                <div class="dust-card__content">
                    <div class="dust-card__text">${this.formatContent(card.content)}</div>
                </div>
                <button class="dust-card__add-to-chat" data-card-type="${card.type}" data-card-content="${this.escapeHtml(card.content)}">
                    Tag in chat
                </button>
            </div>
        `;
    }
    
    
    // Render individual argument card
    renderArgumentCard(argument) {
        const argumentClass = `dust-argument dust-argument--${argument.type}`;
        const emoji = this.getArgumentEmoji(argument.type);
        const argumentId = `argument-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        return `
            <div class="${argumentClass}" data-argument-type="${argument.type}" data-argument-content="${this.escapeHtml(argument.content)}">
                <div class="dust-argument__header" data-argument-id="${argumentId}">
                    <span class="dust-argument__emoji">${emoji}</span>
                    <h4 class="dust-argument__title">${argument.title}</h4>
                    <span class="dust-argument__expand-icon" id="expand-${argumentId}">▼</span>
                </div>
                <div class="dust-argument__content" id="content-${argumentId}" style="display: none;">
                    <div class="dust-argument__text">${this.formatContent(argument.content)}</div>
                </div>
                <button class="dust-argument__add-to-chat" data-argument-title="${this.escapeHtml(argument.title)}" data-argument-content="${this.escapeHtml(argument.content)}" data-parent-card="${this.escapeHtml(argument.parentCard)}">
                    Tag in chat
                </button>
            </div>
        `;
    }
    
    // Get emoji for argument type
    getArgumentEmoji(type) {
        switch (type) {
            case 'positive': return '🟢';
            case 'negative': return '🔴';
            case 'suggestion': return '💡';
            default: return '⚪';
        }
    }
    
    // Add event listeners for all buttons
    addButtonEventListeners() {
        // Add event listeners for main card buttons
        document.querySelectorAll('.dust-card__add-to-chat').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const resultsContainer = button.closest('.results-container');
                const cardId = resultsContainer?.id?.match(/resultsContent-(\d+)/)?.[1] || this.currentCardId;
                const cardType = button.dataset.cardType;
                const cardContent = button.dataset.cardContent;
                this.addCardToChat(cardType, cardContent, cardId);
            });
        });
        
        // Add event listeners for argument buttons
        document.querySelectorAll('.dust-argument__add-to-chat').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const resultsContainer = button.closest('.results-container');
                const cardId = resultsContainer?.id?.match(/resultsContent-(\d+)/)?.[1] || this.currentCardId;
                const title = button.dataset.argumentTitle;
                const content = button.dataset.argumentContent;
                const parentCard = button.dataset.parentCard;
                this.addArgumentToChat(title, content, parentCard, cardId);
            });
        });
    }
    
    // Toggle argument card expansion
    toggleArgument(argumentId) {
        const content = document.getElementById(`content-${argumentId}`);
        const expandIcon = document.getElementById(`expand-${argumentId}`);
        
        if (content.style.display === 'none') {
            content.style.display = 'block';
            expandIcon.textContent = '▲';
        } else {
            content.style.display = 'none';
            expandIcon.textContent = '▼';
        }
    }
    
    // Add argument content to main chat
    addArgumentToChat(title, content, parentCard, cardId) {
        const chatTags = document.getElementById(`chatTags-${cardId || this.currentCardId}`);
        if (!chatTags) return;

        const tagElement = document.createElement('div');
        tagElement.className = 'chat-tag';
        tagElement.innerHTML = `
            <span class="chat-tag-text">${this.getArgumentEmoji(this.detectArgumentType(content))} ${this.escapeHtml(title)}</span>
            <button class="chat-tag-remove" title="Remove">×</button>
        `;

        tagElement.dataset.argumentTitle = title;
        tagElement.dataset.argumentContent = content;
        tagElement.dataset.parentCard = parentCard;

        tagElement.querySelector('.chat-tag-remove').addEventListener('click', () => {
            tagElement.remove();
        });

        chatTags.appendChild(tagElement);
    }
    
    // Render general card for other content
    renderGeneralCard(card) {
        return `
            <div class="dust-card dust-card--general">
                <div class="dust-card__header">
                    <h3 class="dust-card__title">${card.title}</h3>
                </div>
                <div class="dust-card__content">
                    <div class="dust-card__text">${this.formatContent(card.content)}</div>
            </div>
                </div>
            `;
        }
    
    
    // Format content with basic markdown-like formatting
    formatContent(content) {
        // First, handle emoji toggle lists
        let formattedContent = this.createEmojiToggleLists(content);
        
        return formattedContent
            .replace(/\*\*(.*?)\*\*/g, '$1')                   // Remove bold markers from titles
            .replace(/\*(.*?)\*/g, '<em>$1</em>')              // Italic
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color: #007bff; text-decoration: underline;">$2</a>')  // Convert markdown links to clickable blue links
            .replace(/\n\n/g, '</p><p>')                       // Paragraphs
            .replace(/\n/g, '<br>')                            // Line breaks
            .replace(/^(.*)$/, '<p>$1</p>');                   // Wrap in paragraph
    }
    
    // Format content without toggle lists (for flow cards)
    formatContentWithoutToggle(content) {
        return content
            .replace(/\*\*(.*?)\*\*/g, '$1')                   // Remove bold markers from titles
            .replace(/\*(.*?)\*/g, '<em>$1</em>')              // Italic
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color: #007bff; text-decoration: underline;">$2</a>')  // Convert markdown links to clickable blue links
            .replace(/\n\n/g, '</p><p>')                       // Paragraphs
            .replace(/\n/g, '<br>')                            // Line breaks
            .replace(/^(.*)$/, '<p>$1</p>');                   // Wrap in paragraph
    }
    
    // Create toggle lists for lines starting with emojis
    createEmojiToggleLists(content) {
        const lines = content.split('\n');
        const result = [];
        let i = 0;
        
        while (i < lines.length) {
            const line = lines[i];
            
            // Check if line starts with emoji (expanded regex to catch more emojis)
            if (line.match(/^[🔴🟢✅🔵🟡🟠⚫⚪🟣]/)) {
                // Start of emoji list - collect all consecutive emoji lines
                const emojiLines = [];
                while (i < lines.length && lines[i].match(/^[🔴🟢✅🔵🟡🟠⚫⚪🟣]/)) {
                    emojiLines.push(lines[i]);
                    i++;
                }
                
                // Create toggle list
                const toggleId = `emoji-list-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const toggleList = this.createToggleList(toggleId, emojiLines);
                result.push(toggleList);
            } else {
                // Regular line
                result.push(line);
                i++;
            }
        }
        
        return result.join('\n');
    }
    
    // Create HTML for toggle list
    createToggleList(toggleId, emojiLines) {
        const emojiCount = emojiLines.length;
        
        const listItems = emojiLines.map(line => {
            // Check if line contains markdown links
            if (line.includes('[') && line.includes('](') && line.includes(')')) {
                // Apply link formatting and don't escape HTML
                const formattedLine = line
                    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color: #007bff; text-decoration: underline;">$2</a>');
                return `<div class="emoji-list-item">${formattedLine}</div>`;
            } else {
                // No links, escape HTML normally
                return `<div class="emoji-list-item">${this.escapeHtml(line)}</div>`;
            }
        }).join('');
        
        return `
            <div class="emoji-toggle-list">
                <div class="emoji-toggle-header" data-toggle-id="${toggleId}">
                    <span class="emoji-toggle-text">Detailed analysis</span>
                    <span class="emoji-toggle-count">(${emojiCount} items)</span>
                    <span class="emoji-toggle-icon" id="icon-${toggleId}">▼</span>
                </div>
                <div class="emoji-toggle-content" id="content-${toggleId}" style="display: none;">
                    ${listItems}
                </div>
            </div>
        `;
    }
    
    // Toggle emoji list visibility
    toggleEmojiList(toggleId) {
        const content = document.getElementById(`content-${toggleId}`);
        const icon = document.getElementById(`icon-${toggleId}`);
        const container = content?.closest('.emoji-toggle-list');
        
        if (content && icon && container) {
            if (content.style.display === 'none' || content.style.display === '') {
                content.style.display = 'block';
                icon.textContent = '▲';
                container.classList.add('expanded');
            } else {
                content.style.display = 'none';
                icon.textContent = '▼';
                container.classList.remove('expanded');
            }
        }
    }
    
    // Escape HTML for safe attribute usage
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    
    // Add card content to main chat
    addCardToChat(cardType, content, cardId) {
        const chatTags = document.getElementById(`chatTags-${cardId || this.currentCardId}`);
        if (!chatTags) return;

        // Extract title from content (first line or first sentence)
        const title = this.extractTitleFromContent(content);
        
        
        const tagElement = document.createElement('div');
        tagElement.className = 'chat-tag';
        tagElement.innerHTML = `
            <span class="chat-tag-text">📋 ${this.escapeHtml(title)}</span>
            <button class="chat-tag-remove" title="Remove">×</button>
        `;

        tagElement.dataset.cardType = cardType;
        tagElement.dataset.cardTitle = title;
        // Store content directly as a property to avoid HTML attribute length limits
        tagElement.cardContent = content;

        tagElement.querySelector('.chat-tag-remove').addEventListener('click', () => {
            tagElement.remove();
        });

        chatTags.appendChild(tagElement);
    }
    
    // Extract title from card content
    extractTitleFromContent(content) {
        // Remove HTML tags and get first line
        const textContent = content.replace(/<[^>]*>/g, '').trim();
        const firstLine = textContent.split('\n')[0];
        // Limit to 100 characters for display (increased from 50)
        return firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine;
    }
    
    // Demo function to test the card system
    testCardSystem() {
        const sampleDustOutput = `
Product: Social App | Industry: Consumer Tech | Platform: iOS

⭐️ **Business: 60/100**
*   **Profile Gallery**:
    *   🟢 Good: The photo grid encourages users to showcase their personality, which drives engagement.
    *   🔴 Issue: There are no clear calls to action (like, message, follow), which limits user interaction and potential monetization opportunities.
*   **Value Proposition**:
    *   🔴 Issue: The app's purpose is unclear. Is it for dating, friends, or something else? This ambiguity can lead to high user drop-off.

⭐️ **Experience: 50/100**
*   **Navigation Bar**:
    *   🔴 Issue: The floating profile picture at the bottom is redundant and obstructs the view. The "power" icon's function is ambiguous.
*   **Hierarchy**:
    *   🟢 Good: The layout is clean and minimalist, focusing attention on the user's photos.
    *   🔴 Issue: The user's avatar appears twice (top and bottom), creating redundancy and confusion.
*   **Accessibility**:
    *   🔴 Issue: The "Tap for more" text has low contrast, which could be difficult for users with visual impairments to read.

**Most impactful improvement :**
✅ **Solution 1**: Remove the bottom floating navigation and replace it with a standard iOS tab bar. This will clarify the main actions a user can take.
✅ **Solution 2**: Add social interaction features like "like" or "comment" buttons on photos to increase user engagement and session time.
        `;
        
        // Test with the first card
        const cardId = 1;
        this.showResults(sampleDustOutput, cardId);
        this.showResultsContainer(cardId);
        
        console.log('Business/Experience/Solution card system demo loaded! Check the results area.');
    }
    
    // Test the actual workflow with a simulated Dust response
    testActualWorkflow() {
        const simulatedDustResponse = `
Product: E-commerce App | Industry: Retail | Platform: Web

⭐️ **Business: 75/100**
*   **Conversion Optimization**:
    *   🟢 Good: Clear product showcase with high-quality images drives purchase intent.
    *   🔴 Issue: Checkout process has too many steps, potentially causing cart abandonment.
*   **Revenue Streams**:
    *   🟢 Good: Multiple pricing tiers are clearly presented.
    *   🔴 Issue: No clear upsell opportunities during the checkout flow.

⭐️ **Experience: 80/100**
*   **Navigation**:
    *   🟢 Good: Intuitive category browsing and search functionality.
    *   🟢 Good: Breadcrumb navigation helps users understand their location.
*   **Product Discovery**:
    *   🟢 Good: Filter and sort options make product finding efficient.
    *   🔴 Issue: Product comparison feature is not easily accessible.

**Most impactful improvement :**
✅ **Solution 1**: Streamline the checkout process to 2 steps maximum, reducing friction and increasing conversion rates.
✅ **Solution 2**: Add a product comparison tool in the header navigation to help users make informed decisions.
        `;
        
        // Simulate the actual workflow by calling the same functions that would be called with real Dust responses
        const cardId = 1;
        this.showResults(simulatedDustResponse, cardId);
        this.showResultsContainer(cardId);
        
        console.log('Actual workflow test completed! Check the results area for formatted cards.');
    }
    
    async handleCommand(text) {
        if (!text) return;
        const m = String(text).match(COMMAND_RE);
        console.debug('[COMMAND DETECT]', { textTail: String(text).slice(-160), matched: !!m, groups: m?.slice(1) });
        if (!m) return;

        const app = m[1].toLowerCase().trim();
        const flow = m[2].toLowerCase().trim();

        const inspCard = document.getElementById('inspirationsCard');
        const inspContent = document.getElementById('inspirationsContent');
        if (inspCard) inspCard.style.display = 'flex';
        if (inspContent) inspContent.innerHTML = '<div class="placeholder-text">Finding best match…</div>';

        try {
            console.debug('[INSPIRATIONS REQUEST]', { app, flow });

            // Simple call to backend - it handles all mapping now
            const authHeader = await this.getAuthHeader();
            const resp = await fetch(`${this.chatUrl}/inspirations`, {
                method: 'POST',
                headers: {
                    ...authHeader,
                    ...(this.supabaseKey ? { 'apikey': this.supabaseKey } : {}),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ recommendation: { app, flow } })
            });

            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
            }

            const data = await resp.json();
            console.debug('[INSPIRATIONS RESULT]', data);

            if (!data.ok || !Array.isArray(data.data) || data.data.length === 0) {
                // Check if Perplexity sources are provided
                if (data.sources && data.isPerplexityFallback) {
                    console.log('Using Perplexity sources from backend');
                    this.renderPerplexitySources(data.sources, app, flow, inspContent);
                } else {
                    console.log('No inspirations found in DB and no Perplexity fallback');
                    if (inspContent) {
                        inspContent.innerHTML = '<div class="placeholder-text">No inspirations found.</div>';
                    }
                }
                return;
            }

            this.renderInspirations(data.data, app, flow);
        } catch (e) {
            console.error('inspirations error', e);
            if (inspContent) inspContent.innerHTML = `<div class="placeholder-text">Failed to load inspirations: ${String(e)}</div>`;
        }
    }

    renderPerplexitySources(sources, app, flow, inspContent) {
        if (!inspContent) {
            inspContent = document.getElementById('inspirationsContent');
        }
        
        if (!inspContent) return;
        
        if (!sources || sources.length === 0) {
            inspContent.innerHTML = `
                <div class="flow-group">
                    <div class="flow-title">External inspirations — ${app} ${flow}</div>
                    <div class="placeholder-text">No design sources found.</div>
                    <div class="perplexity-note"><small>Powered by Perplexity</small></div>
                </div>`;
        } else {
            inspContent.innerHTML = `
                <div class="flow-group">
                    <div class="flow-title">External inspirations — ${app} ${flow}</div>
                    <div class="sources-list">
                        ${sources.map(source => `
                            <div class="source-item">
                                <a href="${source.url}" target="_blank" rel="noopener noreferrer" class="source-link">
                                    <div class="source-title">${source.title}</div>
                                    <div class="source-description">${source.description}</div>
                                    <div class="source-url">${source.url}</div>
                                </a>
                            </div>
                        `).join('')}
                    </div>
                    <div class="perplexity-note"><small>Powered by Perplexity • Click links to view designs</small></div>
                </div>`;
        }
    }

    
    
    
    // Hide upload card and show response card when using main chat
    hideUploadCardAndShowResponse() {
        const uploadCardsStack = document.getElementById('uploadCardsStack');
        const feedbackCard = document.getElementById('feedbackCard');
        
        if (uploadCardsStack) {
            uploadCardsStack.style.display = 'none';
        }
        
        if (feedbackCard) {
            feedbackCard.classList.add('visible');
            feedbackCard.style.display = 'flex';
        }
    }
    
    // Show response in the feedback card
    showResponseInCard(text) {
        const feedbackContent = document.getElementById('feedbackContent');
        const feedbackCard = document.getElementById('feedbackCard');
        
        if (feedbackCard) {
            feedbackCard.querySelector('.card-title').textContent = 'AI Response';
            // Add compact class for smaller size
            feedbackCard.classList.add('compact');
        }
        
        if (feedbackContent) {
            // Try to parse and format the text into different card types
            const parsedContent = this.parseDustOutput(text);
            
            if (parsedContent.cards && parsedContent.cards.length > 0) {
                // Render structured cards
                feedbackContent.innerHTML = this.renderStructuredCards(parsedContent.cards);
            } else {
                // Fallback to plain text display
                feedbackContent.innerHTML = `<div class="feedback-text">${text}</div>`;
            }
        }
    }
    
    

    // Clean text content by removing HTML/markdown and weird characters
    cleanTextContent(text) {
        if (!text) return '';
        
        return text
            // Remove HTML tags
            .replace(/<[^>]*>/g, '')
            // Remove markdown formatting
            .replace(/\*\*(.*?)\*\*/g, '$1')  // Bold
            .replace(/\*(.*?)\*/g, '$1')      // Italic
            .replace(/`(.*?)`/g, '$1')        // Code
            .replace(/#{1,6}\s*/g, '')        // Headers
            .replace(/^\s*[-*+]\s*/gm, '')    // Bullet points
            .replace(/^\s*\d+\.\s*/gm, '')    // Numbered lists
            // Remove weird characters and clean up
            .replace(/[^\w\s.,!?;:()\-'"]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    
    // Format Perplexity content for better display
    formatPerplexityContent(content) {
        // First, handle emoji toggle lists
        let formattedContent = this.createEmojiToggleLists(content);
        
        return formattedContent
            .replace(/\*\*(.*?)\*\*/g, '$1')                   // Remove bold markers from titles
            .replace(/\*(.*?)\*/g, '<em>$1</em>')              // Italic
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color: #007bff; text-decoration: underline;">$2</a>')  // Convert markdown links to clickable blue links
            .replace(/\n\n/g, '</p><p>')                       // Paragraphs
            .replace(/\n/g, '<br>')                            // Line breaks
            .replace(/^(.*)$/, '<p>$1</p>');                   // Wrap in paragraph
    }

    renderInspirations(flows, app, flow) {
        const inspContent = document.getElementById('inspirationsContent');
        if (!inspContent) return;
        // Pick the flow with the most screens, ignore empty ones
        const enriched = (flows || []).map(f => ({ ...f, screens: (f.screens||[]).slice().sort((a,b)=>(a.order||0)-(b.order||0)) }));
        const nonEmpty = enriched.filter(f => f.screens && f.screens.length > 0);
        if (nonEmpty.length === 0) {
            // No screens found
            console.log('No screens found in DB');
            if (inspContent) {
                inspContent.innerHTML = '<div class="placeholder-text">No screens found in database.</div>';
            }
            return;
        }
        const best = nonEmpty.sort((a,b) => b.screens.length - a.screens.length)[0];
        // lightweight global retry for broken image URLs (encoding variants)
        if (!window.__retryImg) {
            window.__retryImg = function(imgEl) {
                try {
                    const tried = imgEl.getAttribute('data-tried') || '';
                    const triedSet = new Set(tried.split('|').filter(Boolean));
                    const variants = [];
                    const raw = imgEl.getAttribute('data-raw-url') || imgEl.src || '';
                    // 1) replace spaces
                    variants.push(raw.replace(/\s/g, '%20'));
                    // 2) encode each path segment
                    try {
                        const u = new URL(raw);
                        const segs = u.pathname.split('/').map(p => p === '' ? '' : encodeURIComponent(decodeURIComponent(p)));
                        variants.push(`${u.origin}${segs.join('/')}${u.search || ''}`);
                    } catch {}
                    // 3) double-encode segments (handles already-encoded special chars)
                    try {
                        const u2 = new URL(raw);
                        const segs2 = u2.pathname.split('/').map(p => p === '' ? '' : encodeURIComponent(p));
                        variants.push(`${u2.origin}${segs2.join('/')}${u2.search || ''}`);
                    } catch {}
                    for (const v of variants) {
                        if (!triedSet.has(v)) {
                            triedSet.add(v);
                            imgEl.setAttribute('data-tried', Array.from(triedSet).join('|'));
                            imgEl.src = v;
                            return;
                        }
                    }
                } catch (e) { console.warn('retryImg failed', e); }
            };
        }

        console.debug('[INSPIRATIONS IMAGES]', {
            app: best.appName,
            flow: best.flowName,
            count: best.screens.length,
            urls: best.screens.map(x => x.imageUrl)
        });

        const screensHtml = best.screens.map((s) => {
            const url = String(s.imageUrl || '');
            return `
                <div class=\"flow-screen\"> 
                  <img src=\"${url}\" alt=\"${best.appName} ${best.flowName}\" loading=\"eager\" decoding=\"async\" onerror=\"this.onerror=null; this.src=encodeURI('${url}');\"> 
                </div>`;
        }).join('');

        inspContent.innerHTML = `
                <div class="flow-group">
                  <div class="flow-title">${best.appName} — ${best.flowName}</div>
                  <div class="flows">${screensHtml}</div>
                </div>`;
        // Remove inline onerror: bind a fallback handler
        inspContent.querySelectorAll('img').forEach((img) => {
            img.addEventListener('error', () => {
                try {
                    const raw = img.getAttribute('src') || '';
                    const encoded = encodeURI(raw);
                    if (raw !== encoded) img.src = encoded;
                } catch {}
            });
        });
    }

    showError(message, cardId = null) {
        console.error(message);
        if (cardId) {
            this.showResults(`Error: ${message}`, cardId);
        } else {
            // Show error in the most recent card
            this.showResults(`Error: ${message}`, this.currentCardId);
        }
    }

    initChatResultsToggle() {
        const chatResultsToggle = document.getElementById('chatResultsToggle');
        const chatResultsContent = document.getElementById('chatResultsContent');
        
        if (chatResultsToggle && chatResultsContent) {
            chatResultsToggle.addEventListener('click', () => {
                const isCollapsed = chatResultsContent.style.display === 'none';
                
                if (isCollapsed) {
                    // Show content
                    chatResultsContent.style.display = 'block';
                    chatResultsToggle.classList.remove('collapsed');
                    chatResultsToggle.title = 'Hide conversation';
                } else {
                    // Hide content
                    chatResultsContent.style.display = 'none';
                    chatResultsToggle.classList.add('collapsed');
                    chatResultsToggle.title = 'Show conversation';
                }
            });
        }
    }

    initChatBackButton() {
        const chatBackBtn = document.getElementById('chatBackBtn');
        
        if (chatBackBtn) {
            chatBackBtn.addEventListener('click', () => {
                this.renderConversationList();
            });
        }
    }

    initImageModal() {
        const imageModal = document.getElementById('imageModal');
        const imageModalClose = document.getElementById('imageModalClose');
        const imageModalTagBtn = document.getElementById('imageModalTagBtn');
        
        if (imageModal && imageModalClose) {
            // Close modal when clicking close button
            imageModalClose.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hideImageModal();
            });
            
            // Close modal when clicking overlay
            imageModal.addEventListener('click', (e) => {
                if (e.target === imageModal) {
                    this.hideImageModal();
                }
            });
            
            // Close modal with Escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && imageModal.classList.contains('active')) {
                    this.hideImageModal();
                }
            });
        }
        
        if (imageModalTagBtn) {
            // Tag image in chat
            imageModalTagBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.tagImageInChat();
            });
        }
    }

    showImageModal(imageUrl, imageName) {
        const imageModal = document.getElementById('imageModal');
        const imageModalImg = document.getElementById('imageModalImg');
        const imageModalInfo = document.getElementById('imageModalInfo');
        
        if (imageModal && imageModalImg) {
            imageModalImg.src = imageUrl;
            imageModalImg.alt = imageName || 'Full screen image';
            
            if (imageModalInfo) {
                imageModalInfo.textContent = imageName || '';
            }
            
            // Store current image data for tagging
            this.currentModalImage = {
                url: imageUrl,
                name: imageName
            };
            
            imageModal.classList.add('active');
            document.body.style.overflow = 'hidden'; // Prevent background scrolling
        }
    }

    hideImageModal() {
        const imageModal = document.getElementById('imageModal');
        
        if (imageModal) {
            imageModal.classList.remove('active');
            document.body.style.overflow = ''; // Restore scrolling
        }
    }

    tagImageInChat() {
        if (!this.currentModalImage) {
            console.log('No image to tag');
            return;
        }

        const { url, name } = this.currentModalImage;
        
        // Create a message with the tagged image
        const imageTagMessage = `![${name || 'Image'}](${url})`;
        
        // Add the message to chat input
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            // If there's existing text, add a space before the image tag
            const currentText = chatInput.value;
            if (currentText.trim()) {
                chatInput.value = currentText + ' ' + imageTagMessage;
            } else {
                chatInput.value = imageTagMessage;
            }
            
            // Focus the input
            chatInput.focus();
            
            // Close the modal
            this.hideImageModal();
            
            console.log('Image tagged in chat:', imageTagMessage);
        }
    }

    getConversationTitle(conversationId) {
        // Find the conversation in the list and return its title
        if (this.conversationsList && Array.isArray(this.conversationsList)) {
            const conversation = this.conversationsList.find(conv => conv.id === conversationId);
            if (conversation) {
                // Extract title from the conversation data
                // You can customize this based on your data structure
                return conversation.title || conversation.name || `Conversation ${conversationId}`;
            }
        }
        return `Conversation ${conversationId}`;
    }

    initTrainingDataModal() {
        const trainingDataLink = document.getElementById('trainingDataLink');
        const modal = document.getElementById('trainingDataModal');
        const modalClose = document.getElementById('modalClose');
        const folderUploadZone = document.getElementById('folderUploadZone');
        const folderUpload = document.getElementById('folderUpload');

        // Open modal
        trainingDataLink.addEventListener('click', (e) => {
            e.preventDefault();
            modal.classList.add('active');
        });

        // Close modal
        modalClose.addEventListener('click', () => {
            modal.classList.remove('active');
        });

        // Close modal on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });

        // Handle folder upload
        folderUploadZone.addEventListener('click', () => {
            folderUpload.click();
        });

        folderUpload.addEventListener('change', (e) => {
            this.handleFolderUpload(e.target.files);
        });

        // Drag and drop
        folderUploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            folderUploadZone.classList.add('dragover');
        });

        folderUploadZone.addEventListener('dragleave', () => {
            folderUploadZone.classList.remove('dragover');
        });

        folderUploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            folderUploadZone.classList.remove('dragover');
            this.handleFolderUpload(e.dataTransfer.files);
        });
    }

    async handleFolderUpload(files) {
        if (!files || files.length === 0) return;

        // Group files by folder
        const folders = this.groupFilesByFolder(files);
        
        if (Object.keys(folders).length === 0) {
            alert('No valid folders found. Please select folders containing image files.');
            return;
        }

        // Show progress
        const progressContainer = document.getElementById('uploadProgress');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const resultsContainer = document.getElementById('uploadResults');
        const resultsContent = document.getElementById('resultsContent');

        progressContainer.style.display = 'block';
        resultsContainer.style.display = 'none';

        let totalFiles = 0;
        let uploadedFiles = 0;
        let results = [];

        // Count total files
        Object.values(folders).forEach(folder => {
            totalFiles += folder.files.length;
        });

        // Upload each folder
        for (const [folderName, folder] of Object.entries(folders)) {
            const appName = this.extractAppName(folderName);
            const flowName = this.extractFlowName(folderName);
            
            progressText.textContent = `Uploading ${folderName}...`;
            
            try {
                const folderResult = await this.uploadFolder(appName, flowName, folder.files, (progress) => {
                    const totalProgress = ((uploadedFiles + progress) / totalFiles) * 100;
                    progressFill.style.width = `${totalProgress}%`;
                });
                
                results.push({
                    folder: folderName,
                    success: true,
                    count: folderResult.count,
                    flowId: folderResult.flowId
                });
                
                uploadedFiles += folder.files.length;
            } catch (error) {
                results.push({
                    folder: folderName,
                    success: false,
                    error: error.message
                });
            }
        }

        // Show results
        progressContainer.style.display = 'none';
        resultsContainer.style.display = 'block';
        
        let resultsHtml = '<div class="results-list">';
        results.forEach(result => {
            if (result.success) {
                resultsHtml += `
                    <div class="result-item success">
                        <strong>✅ ${result.folder}</strong><br>
                        <small>Uploaded ${result.count} files (Flow ID: ${result.flowId})</small>
                    </div>
                `;
            } else {
                resultsHtml += `
                    <div class="result-item error">
                        <strong>❌ ${result.folder}</strong><br>
                        <small>Error: ${result.error}</small>
                    </div>
                `;
            }
        });
        resultsHtml += '</div>';
        
        resultsContent.innerHTML = resultsHtml;
    }

    groupFilesByFolder(files) {
        const folders = {};
        
        Array.from(files).forEach(file => {
            const path = file.webkitRelativePath || file.name;
            const pathParts = path.split('/');
            
            if (pathParts.length >= 2) {
                const folderName = pathParts[0];
                if (!folders[folderName]) {
                    folders[folderName] = { files: [] };
                }
                folders[folderName].files.push(file);
            }
        });
        
        return folders;
    }

    extractAppName(folderName) {
        // Use the entire folder name as the app name
        return folderName;
    }

    extractFlowName(folderName) {
        // Use the entire folder name as the flow name
        return folderName;
    }

    // Smart matching function kept for compatibility (now returns mapped target)
    async findRelevantFlows(query) {
        // Try to split best-effort into app + flow
        const parts = String(query || '').trim().split(/\s+/);
        const appGuess = parts[0] || '';
        const flowGuess = parts.slice(1).join(' ') || '';
        const mapped = mapAppFlow(appGuess, flowGuess);
        console.debug('[SMART MATCHING]', { query, mapped });
        return [`${mapped.app} ${mapped.flow}`];
    }

    async uploadFolder(appName, flowName, files, progressCallback) {
        const SUPABASE_URL = 'https://iiolvvdnzrfcffudwocp.supabase.co';
        const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlpb2x2dmRuenJmY2ZmdWR3b2NwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzUyMTgwMCwiZXhwIjoyMDczMDk3ODAwfQ.sDlDTwowtdPg2GV9DCl53nSURdYd15iQphrzS1oIcsw';
        const BUCKET = 'flows';

        // Sort files by name
        const sortedFiles = Array.from(files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

        let uploadedCount = 0;
        const errors = [];

        for (let i = 0; i < sortedFiles.length; i++) {
            const file = sortedFiles[i];
            const fileNumber = (i + 1).toString().padStart(2, '0');
            const fileExt = file.name.split('.').pop() || 'png';
            const storagePath = `${flowName}/${fileNumber}.${fileExt}`;

            try {
                const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(storagePath)}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${SERVICE_KEY}`
                    },
                    body: file
                });

                if (response.ok) {
                    uploadedCount++;
                } else {
                    const errorText = await response.text();
                    if (!errorText.includes('Duplicate')) {
                        errors.push(`File ${file.name}: ${errorText}`);
                    } else {
                        uploadedCount++; // Count duplicates as success
                    }
                }
            } catch (error) {
                errors.push(`File ${file.name}: ${error.message}`);
            }

            // Update progress
            if (progressCallback) {
                progressCallback(i + 1);
            }
        }

        if (errors.length > 0 && uploadedCount === 0) {
            throw new Error(errors.join('; '));
        }

        return {
            count: uploadedCount,
            flowId: `${appName}_${flowName}_${Date.now()}` // Generate a simple flow ID
        };
    }
}

// Initialize the app when the page loads
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new DesignRatingApp();
});