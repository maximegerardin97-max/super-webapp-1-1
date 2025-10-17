// Chat Input Component - Extracted from script.js
class ChatInputComponent {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            onComplete: options.onComplete || (() => {}),
            onImageUpload: options.onImageUpload || (() => {}),
            ...options
        };
        
        this.uploadedImageData = null;
        this.userDesignImageData = null;
        
        this.init();
    }
    
    async init() {
        await this.loadTemplate();
        this.setupChatStates();
    }
    
    async loadTemplate() {
        try {
            const response = await fetch('./chat-input-template.html');
            const html = await response.text();
            this.container.innerHTML = html;
        } catch (error) {
            console.error('Error loading chat input template:', error);
            this.container.innerHTML = '<div class="error">Failed to load chat input component</div>';
        }
    }
    
    setupChatStates() {
        const mainChatInput = this.container.querySelector('#mainChatInput');
        const mainChatSendBtn = this.container.querySelector('#mainChatSendBtn');
        const chatImageBtn = this.container.querySelector('#chatImageBtn');
        
        // Step navigation buttons
        const step2BackBtn = this.container.querySelector('#step2BackBtn');
        const step2NextBtn = this.container.querySelector('#step2NextBtn');
        const step3BackBtn = this.container.querySelector('#step3BackBtn');
        const step3NextBtn = this.container.querySelector('#step3NextBtn');
        const step4BackBtn = this.container.querySelector('#step4BackBtn');
        const step4NextBtn = this.container.querySelector('#step4NextBtn');
        const step5BackBtn = this.container.querySelector('#step5BackBtn');
        const step5NextBtn = this.container.querySelector('#step5NextBtn');
        const step6BackBtn = this.container.querySelector('#step6BackBtn');
        const step6SendBtn = this.container.querySelector('#step6SendBtn');
        const step6Input = this.container.querySelector('#step6Input');

        // Handle initial state input
        if (mainChatInput) {
            mainChatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendMainChatMessage();
                }
            });
        }

        if (mainChatSendBtn) {
            mainChatSendBtn.addEventListener('click', () => {
                this.sendMainChatMessage();
            });
        }

        // Handle image upload in chat
        if (chatImageBtn) {
            chatImageBtn.addEventListener('click', () => {
                const input = this.container.querySelector('#chatImageUpload');
                if (input) {
                    input.click();
                }
            });
        }

        // Set up file input change handler
        const fileInput = this.container.querySelector('#chatImageUpload');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.handleChatImageUpload(file);
                    this.goToStep(2); // Move directly to product type selection
                }
            });
        }

        // Step navigation
        if (step2BackBtn) {
            step2BackBtn.addEventListener('click', () => {
                this.goToStep(0);
            });
        }

        if (step2NextBtn) {
            step2NextBtn.addEventListener('click', () => {
                this.goToStep(3);
            });
        }

        if (step3BackBtn) {
            step3BackBtn.addEventListener('click', () => {
                this.goToStep(2);
            });
        }

        if (step3NextBtn) {
            step3NextBtn.addEventListener('click', () => {
                this.goToStep(4);
            });
        }

        if (step4BackBtn) {
            step4BackBtn.addEventListener('click', () => {
                this.goToStep(3);
            });
        }

        if (step4NextBtn) {
            step4NextBtn.addEventListener('click', () => {
                this.goToStep(5);
            });
        }

        if (step5BackBtn) {
            step5BackBtn.addEventListener('click', () => {
                this.goToStep(4);
            });
        }

        if (step5NextBtn) {
            step5NextBtn.addEventListener('click', () => {
                this.goToStep(6);
            });
        }

        if (step6BackBtn) {
            step6BackBtn.addEventListener('click', () => {
                this.goToStep(5);
            });
        }

        if (step6SendBtn) {
            step6SendBtn.addEventListener('click', () => {
                this.sendStep6Message();
            });
        }

        if (step6Input) {
            step6Input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendStep6Message();
                }
            });
        }

        // Handle option tag selection
        this.setupOptionTags();
        
        // Handle image close buttons
        this.setupImageCloseButtons();
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
        }

        // Update progress bar (adjust for 5-step flow)
        const adjustedStep = stepNumber === 0 ? 0 : stepNumber - 1;
        this.updateProgressBar(adjustedStep);
    }

    updateProgressBar(stepNumber) {
        const progressFill = this.container.querySelector('#chatProgressFill');
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

    sendStep6Message() {
        const step6Input = this.container.querySelector('#step6Input');
        const message = step6Input ? step6Input.value.trim() : '';
        if (message) {
            // Collect all selected options
            const productType = this.getSelectedOption('chatStep2');
            const industry = this.getSelectedOption('chatStep3');
            const improveWhat = this.getSelectedOption('chatStep4');
            const optimizeFor = this.getSelectedOption('chatStep5');
            const context = message;

            // Create comprehensive message
            const fullMessage = `Product type: ${productType}, Industry: ${industry}, Improve: ${improveWhat}, Optimize for: ${optimizeFor}, Context: ${context}`;
            
            // Call the completion callback with all data
            this.options.onComplete({
                message: fullMessage,
                productType,
                industry,
                improveWhat,
                optimizeFor,
                context,
                imageData: this.uploadedImageData
            });
            
            // Clear input
            if (step6Input) {
                step6Input.value = '';
            }
            
            // Reset to initial state
            this.goToStep(0);
        }
    }

    getSelectedOption(stepId) {
        const step = this.container.querySelector(`#${stepId}`);
        const selectedTag = step ? step.querySelector('.option-tag.selected') : null;
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
            const button = this.container.querySelector(`#${buttonId}`);
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
        
        // Reset all image buttons to default
        this.container.querySelectorAll('[id^="chatImageBtnStep"]').forEach(btn => {
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
        
        // Clear step 6 input
        const step6Input = this.container.querySelector('#step6Input');
        if (step6Input) {
            step6Input.value = '';
        }
        
        // Return to initial state
        this.goToStep(0);
        
        console.log('Image removed, returned to initial state');
    }

    sendMainChatMessage(customMessage = null) {
        const mainInput = this.container.querySelector('#mainChatInput');
        const candidate = customMessage || (mainInput && mainInput.value) || '';
        const message = candidate.trim();
        if (message) {
            // Call the completion callback
            this.options.onComplete({
                message: message,
                imageData: this.uploadedImageData
            });
            
            // Clear input
            if (mainInput) {
                mainInput.value = '';
            }
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
            
            // Display the image in all step image buttons
            this.displayLargeImage(imageDataUrl, file.name);
            
            // Call the image upload callback
            this.options.onImageUpload(this.uploadedImageData);
            
            console.log('Image uploaded:', file.name);
        };
        reader.readAsDataURL(file);
    }

    displayLargeImage(imageDataUrl, filename) {
        // Update all step image buttons to show the uploaded image
        this.container.querySelectorAll('[id^="chatImageBtnStep"]').forEach(btn => {
            const img = btn.querySelector('img');
            if (img) {
                img.src = imageDataUrl;
                img.alt = filename;
            }
        });
    }

    reset() {
        this.uploadedImageData = null;
        this.userDesignImageData = null;
        
        // Clear inputs
        const mainInput = this.container.querySelector('#mainChatInput');
        const step6Input = this.container.querySelector('#step6Input');
        
        if (mainInput) mainInput.value = '';
        if (step6Input) step6Input.value = '';
        
        // Clear selections
        this.container.querySelectorAll('.option-tag').forEach(opt => opt.classList.remove('selected'));
        
        // Reset image buttons
        this.container.querySelectorAll('[id^="chatImageBtnStep"]').forEach(btn => {
            const img = btn.querySelector('img');
            if (img) {
                img.src = './assets/images/icons/icon-img.png';
                img.alt = 'Send';
            }
        });
        
        // Return to step 0
        this.goToStep(0);
    }
}

// Export for use in other files
window.ChatInputComponent = ChatInputComponent;