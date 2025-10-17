// Chat Input Component
class ChatInputComponent {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            onComplete: options.onComplete || (() => {}),
            context: options.context || 'main',
            onImageUpload: options.onImageUpload || (() => {}),
            ...options
        };
        
        this.currentStep = 0;
        this.stepData = {};
        this.template = null;
        
        this.init();
    }
    
    async init() {
        await this.loadTemplate();
        this.setupEventListeners();
        this.showStep(0);
    }
    
    async loadTemplate() {
        try {
            const response = await fetch('./chat-input-template.html');
            const html = await response.text();
            
            // Create a temporary div to parse the HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            // Extract the component HTML (everything after the style tag)
            const styleTag = tempDiv.querySelector('style');
            const componentHTML = tempDiv.innerHTML.replace(styleTag.outerHTML, '');
            
            // Insert the component into the container
            this.container.innerHTML = componentHTML;
            
            // Add the styles to the document head
            const styleElement = document.createElement('style');
            styleElement.textContent = styleTag.textContent;
            styleElement.setAttribute('data-chat-input-component', 'true');
            document.head.appendChild(styleElement);
            
        } catch (error) {
            console.error('Error loading chat input template:', error);
            this.container.innerHTML = '<div class="error">Failed to load chat input component</div>';
        }
    }
    
    setupEventListeners() {
        // Main input and send button
        const mainInput = this.container.querySelector('#mainChatInput');
        const sendBtn = this.container.querySelector('#mainChatSendBtn');
        const imageBtn = this.container.querySelector('#chatImageBtn');
        
        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.handleMainInput());
        }
        
        if (mainInput) {
            mainInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleMainInput();
                }
            });
        }
        
        if (imageBtn) {
            imageBtn.addEventListener('click', () => {
                this.options.onImageUpload();
            });
        }
        
        // Step navigation
        this.setupStepNavigation();
        
        // Step options
        this.setupStepOptions();
    }
    
    setupStepNavigation() {
        // Back buttons
        for (let i = 1; i <= 5; i++) {
            const backBtn = this.container.querySelector(`#step${i}BackBtn`);
            if (backBtn) {
                backBtn.addEventListener('click', () => this.goToStep(i - 1));
            }
        }
        
        // Context step actions
        const skipContextBtn = this.container.querySelector('#skipContextBtn');
        const continueContextBtn = this.container.querySelector('#continueContextBtn');
        
        if (skipContextBtn) {
            skipContextBtn.addEventListener('click', () => this.completeFlow());
        }
        
        if (continueContextBtn) {
            continueContextBtn.addEventListener('click', () => this.completeFlow());
        }
    }
    
    setupStepOptions() {
        // Step 1: Product Type
        const step1Options = this.container.querySelectorAll('#chatStep1 .step-option');
        step1Options.forEach(option => {
            option.addEventListener('click', () => {
                this.selectOption(1, option.dataset.value, option);
                setTimeout(() => this.goToStep(2), 300);
            });
        });
        
        // Step 2: Industry
        const step2Options = this.container.querySelectorAll('#chatStep2 .step-option');
        step2Options.forEach(option => {
            option.addEventListener('click', () => {
                this.selectOption(2, option.dataset.value, option);
                setTimeout(() => this.goToStep(3), 300);
            });
        });
        
        // Step 3: Improvement Focus
        const step3Options = this.container.querySelectorAll('#chatStep3 .step-option');
        step3Options.forEach(option => {
            option.addEventListener('click', () => {
                this.selectOption(3, option.dataset.value, option);
                setTimeout(() => this.goToStep(4), 300);
            });
        });
        
        // Step 4: Optimization Target
        const step4Options = this.container.querySelectorAll('#chatStep4 .step-option');
        step4Options.forEach(option => {
            option.addEventListener('click', () => {
                this.selectOption(4, option.dataset.value, option);
                setTimeout(() => this.goToStep(5), 300);
            });
        });
    }
    
    handleMainInput() {
        const input = this.container.querySelector('#mainChatInput');
        const message = input ? input.value.trim() : '';
        
        if (message) {
            this.stepData.initialMessage = message;
            this.goToStep(1);
        }
    }
    
    selectOption(step, value, element) {
        // Clear previous selection
        const stepElement = this.container.querySelector(`#chatStep${step}`);
        const allOptions = stepElement.querySelectorAll('.step-option');
        allOptions.forEach(opt => opt.classList.remove('selected'));
        
        // Select current option
        element.classList.add('selected');
        
        // Store the selection
        const stepNames = ['', 'productType', 'industry', 'improvement', 'optimization'];
        this.stepData[stepNames[step]] = value;
    }
    
    goToStep(step) {
        // Hide all steps
        const allSteps = this.container.querySelectorAll('.chat-step');
        allSteps.forEach(stepEl => stepEl.classList.remove('active'));
        
        // Show target step
        const targetStep = this.container.querySelector(`#chatStep${step}`);
        if (targetStep) {
            targetStep.classList.add('active');
            this.currentStep = step;
        }
    }
    
    completeFlow() {
        // Get context input if on step 5
        if (this.currentStep === 5) {
            const contextInput = this.container.querySelector('#contextInput');
            if (contextInput) {
                this.stepData.context = contextInput.value.trim();
            }
        }
        
        // Call the completion callback
        this.options.onComplete(this.stepData);
    }
    
    reset() {
        this.currentStep = 0;
        this.stepData = {};
        this.goToStep(0);
        
        // Clear inputs
        const mainInput = this.container.querySelector('#mainChatInput');
        const contextInput = this.container.querySelector('#contextInput');
        
        if (mainInput) mainInput.value = '';
        if (contextInput) contextInput.value = '';
        
        // Clear selections
        const allOptions = this.container.querySelectorAll('.step-option');
        allOptions.forEach(opt => opt.classList.remove('selected'));
    }
    
    getCurrentData() {
        return { ...this.stepData };
    }
    
    destroy() {
        // Remove styles
        const styleElement = document.querySelector('style[data-chat-input-component="true"]');
        if (styleElement) {
            styleElement.remove();
        }
        
        // Clear container
        this.container.innerHTML = '';
    }
}

// Export for use in other files
window.ChatInputComponent = ChatInputComponent;
