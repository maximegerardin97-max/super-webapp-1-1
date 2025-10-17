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
        this.uploadedImageData = null;
        this.userDesignImageData = null;
        
        this.init();
    }
    
    async init() {
        await this.loadTemplate();
        this.setupEventListeners();
        this.setupImageUpload();
        this.setupPasteFunctionality();
        this.setupDragAndDrop();
        this.setupOptionTags();
        this.setupImageCloseButtons();
        this.goToStep(0);
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
                this.handleChatImageUpload();
            });
        }
        
        // Step navigation
        this.setupStepNavigation();
    }
    
    setupImageUpload() {
        const chatImageUpload = this.container.querySelector('#chatImageUpload');
        if (chatImageUpload) {
            chatImageUpload.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.handleLargeImageUpload(file);
                }
            });
        }
    }
    
    setupPasteFunctionality() {
        // Global paste listener for this component
        document.addEventListener('paste', (e) => {
            // Only handle paste if this component is active
            if (this.container.contains(document.activeElement) || 
                this.container.querySelector('.chat-step.active')) {
                this.handlePaste(e);
            }
        });
    }
    
    setupDragAndDrop() {
        // Add drag and drop to the entire component
        this.container.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.container.classList.add('drag-over');
        });
        
        this.container.addEventListener('dragleave', (e) => {
            e.preventDefault();
            this.container.classList.remove('drag-over');
        });
        
        this.container.addEventListener('drop', (e) => {
            e.preventDefault();
            this.container.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                this.handleLargeImageUpload(file);
            }
        });
    }
    
    setupOptionTags() {
        // Handle option tag clicks
        this.container.querySelectorAll('.option-tag').forEach(tag => {
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
    
    setupImageCloseButtons() {
        // Handle image close buttons for each step
        const closeButtons = [
            'step2ImageCloseBtn', 
            'step3ImageCloseBtn',
            'step4ImageCloseBtn',
            'step5ImageCloseBtn',
            'step6ImageCloseBtn',
            'step7ImageCloseBtn'
        ];
        
        closeButtons.forEach(btnId => {
            const btn = this.container.querySelector(`#${btnId}`);
            if (btn) {
                btn.addEventListener('click', () => {
                    this.removeImage();
                });
            }
        });
    }
    
    setupStepNavigation() {
        // Step 2 navigation
        const step2BackBtn = this.container.querySelector('#step2BackBtn');
        const step2NextBtn = this.container.querySelector('#step2NextBtn');
        
        if (step2BackBtn) {
            step2BackBtn.addEventListener('click', () => this.goToStep(0));
        }
        if (step2NextBtn) {
            step2NextBtn.addEventListener('click', () => this.goToStep(3));
        }
        
        // Step 3 navigation
        const step3BackBtn = this.container.querySelector('#step3BackBtn');
        const step3NextBtn = this.container.querySelector('#step3NextBtn');
        
        if (step3BackBtn) {
            step3BackBtn.addEventListener('click', () => this.goToStep(2));
        }
        if (step3NextBtn) {
            step3NextBtn.addEventListener('click', () => this.goToStep(4));
        }
        
        // Step 4 navigation
        const step4BackBtn = this.container.querySelector('#step4BackBtn');
        const step4NextBtn = this.container.querySelector('#step4NextBtn');
        
        if (step4BackBtn) {
            step4BackBtn.addEventListener('click', () => this.goToStep(3));
        }
        if (step4NextBtn) {
            step4NextBtn.addEventListener('click', () => this.goToStep(5));
        }
        
        // Step 5 navigation
        const step5BackBtn = this.container.querySelector('#step5BackBtn');
        const step5NextBtn = this.container.querySelector('#step5NextBtn');
        
        if (step5BackBtn) {
            step5BackBtn.addEventListener('click', () => this.goToStep(4));
        }
        if (step5NextBtn) {
            step5NextBtn.addEventListener('click', () => this.goToStep(6));
        }
        
        // Step 6 navigation
        const step6BackBtn = this.container.querySelector('#step6BackBtn');
        const step6NextBtn = this.container.querySelector('#step6NextBtn');
        
        if (step6BackBtn) {
            step6BackBtn.addEventListener('click', () => this.goToStep(5));
        }
        if (step6NextBtn) {
            step6NextBtn.addEventListener('click', () => this.goToStep(7));
        }
        
        // Step 7 navigation
        const step7BackBtn = this.container.querySelector('#step7BackBtn');
        const step6SendBtn = this.container.querySelector('#step6SendBtn');
        const step6Input = this.container.querySelector('#step6Input');
        
        if (step7BackBtn) {
            step7BackBtn.addEventListener('click', () => this.goToStep(6));
        }
        if (step6SendBtn) {
            step6SendBtn.addEventListener('click', () => this.sendStep6Message());
        }
        if (step6Input) {
            step6Input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendStep6Message();
                }
            });
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
            this.goToStep(2);
        }
    }
    
    handleChatImageUpload() {
        const input = this.container.querySelector('#chatImageUpload');
        if (input) {
            input.click();
        }
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
            
            // Also store as user design image data
            this.userDesignImageData = { ...this.uploadedImageData };
            
            // Automatically move to step 2 when image is uploaded
            this.goToStep(2);
        };
        reader.readAsDataURL(file);
    }
    
    displayLargeImage(imageDataUrl, filename) {
        // Update all step image buttons to show the uploaded image
        const imageButtons = this.container.querySelectorAll('[id^="chatImageBtnStep"]');
        imageButtons.forEach(btn => {
            const img = btn.querySelector('img');
            if (img) {
                img.src = imageDataUrl;
                img.alt = filename;
            }
        });
    }
    
    handlePaste(e) {
        const items = e.clipboardData.items;
        
        for (let item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                    this.handleLargeImageUpload(file);
                }
                break;
            }
        }
    }
    
    removeImage() {
        // Clear image data
        this.uploadedImageData = null;
        this.userDesignImageData = null;
        
        // Reset all image buttons
        const imageButtons = this.container.querySelectorAll('[id^="chatImageBtnStep"]');
        imageButtons.forEach(btn => {
            const img = btn.querySelector('img');
            if (img) {
                img.src = './assets/images/icons/icon-img.png';
                img.alt = 'Send';
            }
        });
        
        // Reset all option selections
        this.container.querySelectorAll('.option-tag').forEach(tag => {
            tag.classList.remove('selected');
        });
        
        // Clear step 3 input
        const step3Input = this.container.querySelector('#step3Input');
        if (step3Input) {
            step3Input.value = '';
        }
        
        // Return to initial state
        this.goToStep(0);
    }
    
    goToStep(stepNumber) {
        // Hide all steps
        this.container.querySelectorAll('.chat-step').forEach(step => {
            step.classList.add('hidden');
            step.classList.remove('active');
        });

        // Show target step
        const targetStep = this.container.querySelector(`#chatStep${stepNumber}`);
        if (targetStep) {
            targetStep.classList.remove('hidden');
            targetStep.classList.add('active');
            this.currentStep = stepNumber;
        }
        
        // Update progress bars
        this.updateProgressBars(stepNumber);
    }
    
    updateProgressBars(currentStep) {
        const progressBars = this.container.querySelectorAll('.progress-fill');
        progressBars.forEach((bar, index) => {
            const stepNumber = index + 2; // Progress bars start from step 2
            if (stepNumber <= currentStep) {
                bar.style.width = '100%';
            } else {
                bar.style.width = '0%';
            }
        });
    }
    
    getSelectedOption(stepId) {
        const step = this.container.querySelector(`#${stepId}`);
        const selectedTag = step ? step.querySelector('.option-tag.selected') : null;
        return selectedTag ? selectedTag.dataset.value : '';
    }
    
    sendStep6Message() {
        const step6Input = this.container.querySelector('#step6Input');
        const finalMessage = step6Input ? step6Input.value.trim() : '';
        
        // Build the complete message
        let message = this.stepData.initialMessage || '';
        
        const productType = this.getSelectedOption('chatStep2');
        const industry = this.getSelectedOption('chatStep3');
        const improvement = this.getSelectedOption('chatStep4');
        const optimization = this.getSelectedOption('chatStep5');
        const context = this.container.querySelector('#step3Input') ? this.container.querySelector('#step3Input').value.trim() : '';
        
        if (productType) {
            message += ` Product type: ${productType}`;
        }
        if (industry) {
            message += `, Industry: ${industry}`;
        }
        if (improvement) {
            message += `, Improve: ${improvement}`;
        }
        if (optimization) {
            message += `, Optimize for: ${optimization}`;
        }
        if (context) {
            message += `, Context: ${context}`;
        }
        if (finalMessage) {
            message += `, Additional: ${finalMessage}`;
        }
        
        // Store the complete data
        this.stepData = {
            ...this.stepData,
            productType,
            industry,
            improvement,
            optimization,
            context,
            finalMessage,
            imageData: this.uploadedImageData
        };
        
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
