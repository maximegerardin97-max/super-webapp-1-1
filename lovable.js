// Test if script is loading
console.log('Lovable script loaded');

// Constants
const FREE_PROMPT_LIMIT = 3;
const STORAGE_KEY = 'lovable_usage_count';
const MONTHLY_PRICE = 29;
const YEARLY_PRICE = 25; // 15% discount

// State Management
const state = {
    url: '',
    selectedAreas: [],
    improvements: [],
    dismissedIds: [],
    usageCount: 0,
    selectedPlan: 'monthly'
};

// Mock improvements data
const mockImprovements = {
    ux: [
        {
            id: 'ux_1',
            category: 'UX',
            title: 'Add loading states to async actions',
            description: 'Users need visual feedback when actions are processing. Add skeleton loaders and spinners to improve perceived performance.',
            promptFragment: 'Add loading skeleton states to all async data fetches and button actions'
        },
        {
            id: 'ux_2',
            category: 'UX',
            title: 'Implement error boundaries',
            description: 'Handle errors gracefully with user-friendly messages instead of breaking the experience.',
            promptFragment: 'Add error boundary components with friendly error messages and retry options'
        }
    ],
    ui: [
        {
            id: 'ui_1',
            category: 'UI',
            title: 'Improve visual hierarchy',
            description: 'Use better contrast ratios and spacing to guide user attention to primary actions.',
            promptFragment: 'Increase visual hierarchy using larger font sizes for headings and more whitespace'
        },
        {
            id: 'ui_2',
            category: 'UI',
            title: 'Add micro-interactions',
            description: 'Subtle hover states and transitions make the interface feel more responsive and polished.',
            promptFragment: 'Add smooth hover transitions and click animations to interactive elements'
        }
    ],
    copy: [
        {
            id: 'copy_1',
            category: 'Copy',
            title: 'Simplify CTA copy',
            description: 'Use action-oriented, concise language for buttons. Replace "Submit Form" with "Get Started".',
            promptFragment: 'Make all CTA buttons more action-oriented and concise (e.g., "Get Started" instead of "Submit")'
        },
        {
            id: 'copy_2',
            category: 'Copy',
            title: 'Add social proof',
            description: 'Include testimonials or user count to build trust and credibility.',
            promptFragment: 'Add a testimonial section or user count display to build social proof'
        }
    ],
    styling: [
        {
            id: 'styling_1',
            category: 'Styling',
            title: 'Consistent border radius',
            description: 'Apply uniform border-radius across all cards and buttons for a cohesive look.',
            promptFragment: 'Use consistent border-radius of 12px for all cards, buttons, and input fields'
        },
        {
            id: 'styling_2',
            category: 'Styling',
            title: 'Enhance dark mode support',
            description: 'Improve contrast and readability in dark mode with better color choices.',
            promptFragment: 'Enhance dark mode with improved contrast ratios and softer background colors'
        }
    ]
};

// DOM Elements
const inputScreen = document.getElementById('inputScreen');
const resultsScreen = document.getElementById('resultsScreen');
const promptScreen = document.getElementById('promptScreen');

const siteUrlInput = document.getElementById('siteUrl');
const analyzeBtn = document.getElementById('analyzeBtn');
const areaBtns = document.querySelectorAll('.lovable-area-btn');

const improvementsContainer = document.getElementById('improvementsContainer');
const selectedCountSpan = document.getElementById('selectedCount');
const generateBtn = document.getElementById('generateBtn');

const generatedPromptTextarea = document.getElementById('generatedPrompt');
const copyBtn = document.getElementById('copyBtn');
const resetBtn = document.getElementById('resetBtn');

// Usage & Paywall Elements
const usageBarFill = document.getElementById('usageBarFill');
const usageText = document.getElementById('usageText');
const upgradeBtn = document.getElementById('upgradeBtn');
const paywallModal = document.getElementById('paywallModal');
const paywallCloseBtn = document.getElementById('paywallCloseBtn');
const monthlyToggle = document.getElementById('monthlyToggle');
const yearlyToggle = document.getElementById('yearlyToggle');
const pricingAmount = document.getElementById('pricingAmount');
const pricingPeriod = document.getElementById('pricingPeriod');
const upgradeNowBtn = document.getElementById('upgradeNowBtn');
const upgradeButtonText = document.getElementById('upgradeButtonText');

// Results Screen Elements
const displayedUrl = document.getElementById('displayedUrl');
const usageBarFillMini = document.getElementById('usageBarFillMini');
const usageTextMini = document.getElementById('usageTextMini');

// Prompt Screen Elements
const usageBarFillMiniPrompt = document.getElementById('usageBarFillMiniPrompt');
const usageTextMiniPrompt = document.getElementById('usageTextMiniPrompt');
const improveAgainBtn = document.getElementById('improveAgainBtn');

// Paywall Screen Elements
const usageBarFillMiniPaywall = document.getElementById('usageBarFillMiniPaywall');
const usageTextMiniPaywall = document.getElementById('usageTextMiniPaywall');

// Input Screen Elements
const urlStep = document.getElementById('urlStep');
const tagsStep = document.getElementById('tagsStep');
const urlSendBtn = document.getElementById('urlSendBtn');
const tagsSendBtn = document.getElementById('tagsSendBtn');

// Results Screen Elements
const refreshBtn = document.getElementById('refreshBtn');

// Debug DOM elements
console.log('DOM elements found:');
console.log('refreshBtn:', refreshBtn);
console.log('urlSendBtn:', urlSendBtn);
console.log('tagsSendBtn:', tagsSendBtn);

// Initialize
function init() {
    console.log('Init function called');
    // Load usage from localStorage
    loadUsage();
    updateUsageUI();
    
    // Auto-focus input field when typing
    document.addEventListener('keydown', (e) => {
        // Only auto-focus if we're on the input screen and not already focused on an input
        if (inputScreen.classList.contains('active') && 
            document.activeElement !== siteUrlInput && 
            document.activeElement.tagName !== 'INPUT' && 
            document.activeElement.tagName !== 'TEXTAREA') {
            siteUrlInput.focus();
        }
    });
    
    // URL input validation
    siteUrlInput.addEventListener('input', validateInputs);
    
    // Handle Enter key press
    siteUrlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            validateUrl();
        }
    });
    
    // Handle Enter key press for tags step
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            // Only handle Enter if we're on tags step and URL input is not focused
            if (tagsStep.style.display === 'flex' && 
                document.activeElement !== siteUrlInput && 
                state.selectedAreas.length > 0) {
                e.preventDefault();
                analyzeSite();
            }
        }
    });
    
    // Area selection
    areaBtns.forEach(btn => {
        btn.addEventListener('click', () => toggleArea(btn));
    });
    
    // URL send button
    urlSendBtn.addEventListener('click', validateUrl);
    
    // URL input typing
    siteUrlInput.addEventListener('input', updateUrlButtonOpacity);
    
    // Tags send button
    tagsSendBtn.addEventListener('click', analyzeSite);
    
    // Generate prompt button
    if (generateBtn) {
        generateBtn.addEventListener('click', generatePrompt);
    }
    
    // Copy button
    if (copyBtn) {
        copyBtn.addEventListener('click', copyToClipboard);
    }
    
    // Reset button
    if (resetBtn) {
        resetBtn.addEventListener('click', resetApp);
    }
    
    // Upgrade button
    if (upgradeBtn) {
        upgradeBtn.addEventListener('click', openPaywall);
    }
    
    // Improve again button
    if (improveAgainBtn) {
        improveAgainBtn.addEventListener('click', resetApp);
    }
    
    // Refresh button on results screen
    if (refreshBtn) {
        console.log('Refresh button found, adding event listener');
        refreshBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Refresh button clicked');
            resetApp();
        });
    } else {
        console.log('Refresh button not found');
    }
    
    // Paywall close
    if (paywallCloseBtn) {
        paywallCloseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closePaywall();
        });
    }
    if (paywallModal) {
        paywallModal.addEventListener('click', (e) => {
            if (e.target === paywallModal) closePaywall();
        });
    }
    
    // Plan toggle
    monthlyToggle.addEventListener('click', () => selectPlan('monthly'));
    yearlyToggle.addEventListener('click', () => selectPlan('yearly'));
    
    // Upgrade now button
    upgradeNowBtn.addEventListener('click', handleUpgrade);
    
    // Select all areas by default
    selectAllAreasByDefault();
}

// Select all areas by default on init
function selectAllAreasByDefault() {
    areaBtns.forEach(btn => {
        const area = btn.dataset.area;
        if (!state.selectedAreas.includes(area)) {
            state.selectedAreas.push(area);
            btn.classList.add('selected');
        }
    });
    validateInputs();
    updateTagsButtonOpacity();
}

// Toggle area selection
function toggleArea(btn) {
    const area = btn.dataset.area;
    
    if (state.selectedAreas.includes(area)) {
        state.selectedAreas = state.selectedAreas.filter(a => a !== area);
        btn.classList.remove('selected');
    } else {
        state.selectedAreas.push(area);
        btn.classList.add('selected');
    }
    
    validateInputs();
    updateTagsButtonOpacity();
}

// Update URL button opacity based on input
function updateUrlButtonOpacity() {
    const hasUrl = siteUrlInput.value.trim().length > 0;
    if (hasUrl) {
        urlSendBtn.classList.add('active');
    } else {
        urlSendBtn.classList.remove('active');
    }
}

// Update tags button opacity based on selection
function updateTagsButtonOpacity() {
    const hasTags = state.selectedAreas.length > 0;
    if (hasTags) {
        tagsSendBtn.classList.add('active');
    } else {
        tagsSendBtn.classList.remove('active');
    }
}

// Validate URL step
function validateUrl() {
    const urlValue = siteUrlInput.value.trim();
    if (urlValue.length === 0) return;
    
    state.url = urlValue;
    
    // Hide URL step and show tags step
    urlStep.style.display = 'none';
    tagsStep.style.display = 'flex';
    
    // Select all areas by default when transitioning to tags step
    selectAllAreasByDefault();
}

// Validate inputs for tags step
function validateInputs() {
    const hasAreas = state.selectedAreas.length > 0;
    tagsSendBtn.disabled = !hasAreas;
}

// Analyze site (mock)
function analyzeSite() {
    // Collect improvements based on selected areas
    state.improvements = [];
    
    state.selectedAreas.forEach(area => {
        if (mockImprovements[area]) {
            state.improvements.push(...mockImprovements[area]);
        }
    });
    
    // Reset dismissed
    state.dismissedIds = [];
    
    // Update displayed URL
    displayedUrl.value = state.url;
    
    // Show results screen
    showScreen('results');
    renderImprovements();
    updateSelectedCount();
    updateUsageUI();
}

// Render improvement cards
function renderImprovements() {
    improvementsContainer.innerHTML = '';
    
    const activeImprovements = state.improvements.filter(
        imp => !state.dismissedIds.includes(imp.id)
    );
    
    activeImprovements.forEach(improvement => {
        const card = createImprovementCard(improvement);
        improvementsContainer.appendChild(card);
    });
}

// Create improvement card
function createImprovementCard(improvement) {
    const card = document.createElement('div');
    card.className = 'lovable-improvement-card';
    card.dataset.id = improvement.id;
    
    card.innerHTML = `
        <div class="improvement-card-header">
            <h3 class="improvement-title">${improvement.title}</h3>
            <button class="url-action-btn" data-id="${improvement.id}">
                <img src="./assets/images/icons/icon-minus-wht.png" alt="Dismiss" class="auth-icon-img" />
            </button>
        </div>
        <p class="improvement-description">${improvement.description}</p>
    `;
    
    // Add dismiss handler
    const dismissBtn = card.querySelector('.url-action-btn');
    dismissBtn.addEventListener('click', () => dismissImprovement(improvement.id));
    
    return card;
}

// Dismiss improvement
function dismissImprovement(id) {
    state.dismissedIds.push(id);
    renderImprovements();
    updateSelectedCount();
}

// Update selected count
function updateSelectedCount() {
    const activeCount = state.improvements.length - state.dismissedIds.length;
    if (selectedCountSpan) {
        selectedCountSpan.textContent = `${activeCount} improvement${activeCount !== 1 ? 's' : ''} selected`;
    }
}

// Generate prompt
function generatePrompt() {
    // Check usage limit
    if (state.usageCount >= FREE_PROMPT_LIMIT) {
        openPaywall();
        return;
    }
    
    const activeImprovements = state.improvements.filter(
        imp => !state.dismissedIds.includes(imp.id)
    );
    
    let prompt = `Please improve the following aspects of my Lovable site (${state.url}):\n\n`;
    
    activeImprovements.forEach((imp, index) => {
        prompt += `${index + 1}. ${imp.promptFragment}\n`;
    });
    
    prompt += `\nMaintain the existing design language and ensure all changes are cohesive.`;
    
    generatedPromptTextarea.value = prompt;
    showScreen('prompt');
    
    // Increment usage
    incrementUsage();
}

// Copy to clipboard
function copyToClipboard() {
    generatedPromptTextarea.select();
    document.execCommand('copy');
    
    // Visual feedback
    const originalText = copyBtn.innerHTML;
    copyBtn.innerHTML = `
        <img src="./assets/images/icons/icon-check-light.png" alt="Copied" class="auth-icon-img" />
        Copied!
    `;
    
    setTimeout(() => {
        copyBtn.innerHTML = originalText;
    }, 2000);
}

// Reset app
function resetApp() {
    console.log('resetApp called');
    state.url = '';
    state.selectedAreas = [];
    state.improvements = [];
    state.dismissedIds = [];
    
    siteUrlInput.value = '';
    areaBtns.forEach(btn => btn.classList.remove('selected'));
    tagsSendBtn.disabled = true;
    
    // Reset button opacity states
    urlSendBtn.classList.remove('active');
    tagsSendBtn.classList.remove('active');
    
    // Reset to URL step
    urlStep.style.display = 'flex';
    tagsStep.style.display = 'none';
    
    showScreen('input');
    console.log('resetApp completed');
}

// Show screen
function showScreen(screen) {
    inputScreen.classList.remove('active');
    resultsScreen.classList.remove('active');
    promptScreen.classList.remove('active');
    
    if (screen === 'input') {
        inputScreen.classList.add('active');
    } else if (screen === 'results') {
        resultsScreen.classList.add('active');
    } else if (screen === 'prompt') {
        promptScreen.classList.add('active');
    }
}

// Usage Management
function loadUsage() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        state.usageCount = parseInt(stored, 10) || 0;
    }
    // Reset to 0 for testing
    state.usageCount = 0;
}

function saveUsage() {
    localStorage.setItem(STORAGE_KEY, state.usageCount.toString());
}

function incrementUsage() {
    state.usageCount++;
    saveUsage();
    updateUsageUI();
}

function updateUsageUI() {
    const percentage = (state.usageCount / FREE_PROMPT_LIMIT) * 100;
    
    // Update floating widget
    if (usageBarFill && usageText) {
        usageBarFill.style.width = `${Math.min(percentage, 100)}%`;
        usageText.textContent = `${state.usageCount}/${FREE_PROMPT_LIMIT} free prompts used`;
    }
    
    // Update mini usage widget in results screen action area
    if (usageBarFillMini && usageTextMini) {
        usageBarFillMini.style.width = `${Math.min(percentage, 100)}%`;
        usageTextMini.textContent = `${state.usageCount}/${FREE_PROMPT_LIMIT} free`;
    }
    
    // Update mini usage widget in prompt screen action area
    if (usageBarFillMiniPrompt && usageTextMiniPrompt) {
        usageBarFillMiniPrompt.style.width = `${Math.min(percentage, 100)}%`;
        usageTextMiniPrompt.textContent = `${state.usageCount}/${FREE_PROMPT_LIMIT} free`;
    }
    
    // Update mini usage widget in paywall action area
    if (usageBarFillMiniPaywall && usageTextMiniPaywall) {
        usageBarFillMiniPaywall.style.width = `${Math.min(percentage, 100)}%`;
        usageTextMiniPaywall.textContent = `${state.usageCount}/${FREE_PROMPT_LIMIT} free`;
    }
    
    // Show upgrade button if limit reached
    if (upgradeBtn && state.usageCount >= FREE_PROMPT_LIMIT) {
        upgradeBtn.classList.add('highlight');
    } else if (upgradeBtn) {
        upgradeBtn.classList.remove('highlight');
    }
}

// Paywall Functions
function openPaywall() {
    paywallModal.classList.add('active');
}

function closePaywall() {
    paywallModal.classList.remove('active');
}

function selectPlan(plan) {
    state.selectedPlan = plan;
    
    // Update toggle buttons
    if (plan === 'monthly') {
        monthlyToggle.classList.add('active');
        yearlyToggle.classList.remove('active');
        const price = MONTHLY_PRICE;
        upgradeButtonText.textContent = `Upgrade for $${price}/mo`;
    } else {
        monthlyToggle.classList.remove('active');
        yearlyToggle.classList.add('active');
        const price = YEARLY_PRICE;
        upgradeButtonText.textContent = `Upgrade for $${price}/mo`;
    }
}

function handleUpgrade() {
    // Placeholder for payment integration
    alert(`Upgrade to ${state.selectedPlan} plan: $${state.selectedPlan === 'monthly' ? MONTHLY_PRICE : YEARLY_PRICE}/month\n\nPayment integration coming soon!`);
    closePaywall();
}

// Start app
try {
    init();
} catch (error) {
    console.error('Error initializing app:', error);
}

