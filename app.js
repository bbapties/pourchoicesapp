// Pour Choices MVP - Main Application Logic
// Version: 2.0 | Date: September 17, 2025

class PourChoicesApp {
    constructor() {
        this.currentUser = null;
        this.currentScreen = 'welcome';
        this.signupStep = 1;
        this.selectedProfilePic = 'whiskey-glass';
        this.bottles = [];
        this.userCollection = [];
        this.tastings = [];
        
        // Blind Tastings state
        this.currentTasting = null;
        this.selectedBottles = [];
        this.tastingAssignments = {};
        this.tastingNotes = {};
        this.tastingRanks = {};
        this.currentTastingStep = 'selection';
        this.currentBottle = 'A';
        this.flavorSuggestions = [
            'Oak', 'Vanilla', 'Smoke', 'Citrus', 'Caramel', 'Honey', 'Spice', 'Fruit',
            'Chocolate', 'Coffee', 'Nutty', 'Floral', 'Herbal', 'Peaty', 'Sweet',
            'Bitter', 'Smooth', 'Sharp', 'Rich', 'Light', 'Bold', 'Complex', 'Simple'
        ];
        
        // Search and filtering state
        this.currentSearchResults = [];
        this.currentFilters = {
            name: '',
            distillery: '',
            type: '',
            yourRankMin: 0,
            yourRankMax: 100,
            globalRankMin: 0,
            globalRankMax: 100
        };
        this.currentSort = 'your';
        
        // Analytics tracking
        this.analytics = {
            events: [],
            logEvent: (screen, action, data = {}) => {
                const event = {
                    timestamp: new Date().toISOString(),
                    user_id: this.currentUser?.id || 'anonymous',
                    screen,
                    action,
                    ...data
                };
                this.analytics.events.push(event);
                console.log('Analytics Event:', event);
            }
        };
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuthStatus();
        this.loadSampleData();
        this.analytics.logEvent('app', 'init');
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');

        // Welcome screen
        const signupBtn = document.getElementById('signup-btn');
        if (signupBtn) {
            signupBtn.addEventListener('click', () => {
                console.log('Sign up button clicked');
                this.showSignupModal();
            });
        }

        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.showLoginModal());
            console.log('Login button event listener attached');
        } else {
            console.error('Login button not found!');
        }

        // Signup modal - add null checks
        const closeSignup = document.getElementById('close-signup');
        if (closeSignup) closeSignup.addEventListener('click', () => this.closeModal('signup-modal'));

        const nextStep = document.getElementById('next-step');
        if (nextStep) nextStep.addEventListener('click', () => this.nextSignupStep());

        const skipStep2 = document.getElementById('skip-step2');
        if (skipStep2) skipStep2.addEventListener('click', () => this.skipStep2());

        const completeSignup = document.getElementById('complete-signup');
        if (completeSignup) completeSignup.addEventListener('click', () => this.completeSignup());

        // Login modal - add null checks
        const closeLogin = document.getElementById('close-login');
        if (closeLogin) closeLogin.addEventListener('click', () => this.closeModal('login-modal'));

        const loginSubmit = document.getElementById('login-submit');
        if (loginSubmit) loginSubmit.addEventListener('click', () => this.submitLogin());

        // Form validation - add null checks
        const username = document.getElementById('username');
        if (username) username.addEventListener('input', () => this.validateUsername());

        const email = document.getElementById('email');
        if (email) email.addEventListener('input', () => this.validateEmail());

        const loginEmail = document.getElementById('login-email');
        if (loginEmail) loginEmail.addEventListener('input', () => this.validateLoginEmail());

        // Profile picture selection
        document.querySelectorAll('.profile-pic-option').forEach(option => {
            option.addEventListener('click', () => this.selectProfilePic(option));
        });

        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => this.navigateToScreen(item.dataset.screen));
        });

        // Search functionality - add null checks
        const searchBtn = document.getElementById('search-btn');
        if (searchBtn) searchBtn.addEventListener('click', () => this.performSearch());

        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performSearch();
        });

        const barcodeScanner = document.getElementById('barcode-scanner');
        if (barcodeScanner) barcodeScanner.addEventListener('click', () => this.showComingSoon('Barcode scanning'));

        const searchSort = document.getElementById('search-sort');
        if (searchSort) searchSort.addEventListener('change', () => this.sortSearchResults());

        const searchFilterBtn = document.getElementById('search-filter-btn');
        if (searchFilterBtn) searchFilterBtn.addEventListener('click', () => this.showSearchFilterModal());

        // Bottle actions - add null checks
        const addNewBottle = document.getElementById('add-new-bottle');
        if (addNewBottle) addNewBottle.addEventListener('click', () => this.showAddBottleModal());

        const addBottlePrompt = document.getElementById('add-bottle-prompt');
        if (addBottlePrompt) addBottlePrompt.addEventListener('click', () => this.showAddBottleModal());

        const startTasting = document.getElementById('start-tasting');
        if (startTasting) startTasting.addEventListener('click', () => this.startTasting());

        const addToCollection = document.getElementById('add-to-collection');
        if (addToCollection) addToCollection.addEventListener('click', () => this.addToCollection());

        // Modals - add null checks
        const closeDetails = document.getElementById('close-details');
        if (closeDetails) closeDetails.addEventListener('click', () => this.closeModal('bottle-details-modal'));

        const closeAddBottle = document.getElementById('close-add-bottle');
        if (closeAddBottle) closeAddBottle.addEventListener('click', () => this.closeModal('add-bottle-modal'));

        const closeEditBottle = document.getElementById('close-edit-bottle');
        if (closeEditBottle) closeEditBottle.addEventListener('click', () => this.closeModal('edit-bottle-modal'));

        const closeSearchFilter = document.getElementById('close-search-filter');
        if (closeSearchFilter) closeSearchFilter.addEventListener('click', () => this.closeModal('search-filter-modal'));

        const closeAiPhoto = document.getElementById('close-ai-photo');
        if (closeAiPhoto) closeAiPhoto.addEventListener('click', () => this.closeModal('ai-photo-modal'));

        // Add bottle form
        const addBottleForm = document.querySelector('.add-bottle-form');
        if (addBottleForm) addBottleForm.addEventListener('submit', (e) => this.submitAddBottle(e));

        const bottleType = document.getElementById('bottle-type');
        if (bottleType) bottleType.addEventListener('change', () => this.handleBottleTypeChange());

        const scanBarcode = document.getElementById('scan-barcode');
        if (scanBarcode) scanBarcode.addEventListener('click', () => this.showComingSoon('Barcode scanning'));

        // My Bar functionality - add null checks
        const addBottleFab = document.getElementById('add-bottle-fab');
        if (addBottleFab) addBottleFab.addEventListener('click', () => this.showAddBottleOptions());

        const buildBarBtn = document.getElementById('build-bar-btn');
        if (buildBarBtn) buildBarBtn.addEventListener('click', () => this.navigateToScreen('search'));

        const mybarSearch = document.getElementById('mybar-search');
        if (mybarSearch) mybarSearch.addEventListener('input', () => this.searchMyBar());

        // Edit bottle functionality - add null checks
        const saveEdit = document.getElementById('save-edit');
        if (saveEdit) saveEdit.addEventListener('click', () => this.saveBottleEdit());

        const cancelEdit = document.getElementById('cancel-edit');
        if (cancelEdit) cancelEdit.addEventListener('click', () => this.closeModal('edit-bottle-modal'));

        const editVolume = document.getElementById('edit-volume');
        if (editVolume) editVolume.addEventListener('input', () => this.updateVolumeDisplay());

        const decreaseOwned = document.getElementById('decrease-owned');
        if (decreaseOwned) decreaseOwned.addEventListener('click', () => this.adjustNumberOwned(-1));

        const increaseOwned = document.getElementById('increase-owned');
        if (increaseOwned) increaseOwned.addEventListener('click', () => this.adjustNumberOwned(1));

        const editNotes = document.getElementById('edit-notes');
        if (editNotes) editNotes.addEventListener('input', () => this.updateCharCounter());

        // Coming soon - add null check
        const backFromComingSoon = document.getElementById('back-from-coming-soon');
        if (backFromComingSoon) backFromComingSoon.addEventListener('click', () => this.hideComingSoon());

        // Filter functionality - add null checks
        const applyFilters = document.getElementById('apply-filters');
        if (applyFilters) applyFilters.addEventListener('click', () => this.applySearchFilters());

        const clearFilters = document.getElementById('clear-filters');
        if (clearFilters) clearFilters.addEventListener('click', () => this.clearSearchFilters());

        this.setupRangeSliders();

        // AI Photo Recognition - add null checks
        const capturePhoto = document.getElementById('capture-photo');
        if (capturePhoto) capturePhoto.addEventListener('click', () => this.capturePhoto());

        const retakePhoto = document.getElementById('retake-photo');
        if (retakePhoto) retakePhoto.addEventListener('click', () => this.resetPhotoRecognition());

        const retryRecognition = document.getElementById('retry-recognition');
        if (retryRecognition) retryRecognition.addEventListener('click', () => this.resetPhotoRecognition());

        const manualAdd = document.getElementById('manual-add');
        if (manualAdd) manualAdd.addEventListener('click', () => this.switchToManualAdd());

        const aiBottleForm = document.querySelector('.ai-bottle-form');
        if (aiBottleForm) aiBottleForm.addEventListener('submit', (e) => this.submitAIBottle(e));

        // Blind Tastings
        this.setupTastingEventListeners();

        // Modal overlay clicks
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.closeModal(overlay.closest('.modal').id);
                }
            });
        });
    }

    checkAuthStatus() {
        const savedUser = localStorage.getItem('pourChoicesUser');
        const rememberMe = localStorage.getItem('pourChoicesRemember');
        
        if (savedUser && rememberMe === 'true') {
            this.currentUser = JSON.parse(savedUser);
            this.showScreen('search');
            this.analytics.logEvent('auth', 'auto_login', { method: 'cookie' });
        } else if (savedUser) {
            // Show login modal after 3 seconds
            setTimeout(() => {
                this.showLoginModal();
            }, 3000);
        }
    }

    showScreen(screenName) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        // Show target screen
        document.getElementById(`${screenName}-screen`).classList.add('active');
        this.currentScreen = screenName;

        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-screen="${screenName}"]`).classList.add('active');

        // Load screen-specific data
        this.loadScreenData(screenName);
        this.analytics.logEvent(screenName, 'view');
    }

    loadScreenData(screenName) {
        switch (screenName) {
            case 'search':
                this.loadSearchScreen();
                break;
            case 'mybar':
                this.loadMyBarScreen();
                break;
            case 'profile':
                this.loadProfileScreen();
                break;
        }
    }

    // Workflow 1: User Profile Creation
    showSignupModal() {
        this.showModal('signup-modal');
        this.signupStep = 1;
        this.updateSignupProgress();
        this.analytics.logEvent('signup', 'modal_open');
    }

    showLoginModal() {
        this.showModal('login-modal');
        this.analytics.logEvent('login', 'modal_open');
    }

    showModal(modalId) {
        document.getElementById(modalId).classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
        document.body.style.overflow = 'auto';
        this.analytics.logEvent('modal', 'close', { modal: modalId });
    }

    updateSignupProgress() {
        const progress = (this.signupStep / 2) * 100;
        document.getElementById('signup-progress').style.width = `${progress}%`;
        document.getElementById('signup-step').textContent = `Step ${this.signupStep}/2`;
    }

    validateUsername() {
        const username = document.getElementById('username').value;
        const validation = document.getElementById('username-validation');
        const isValid = /^[a-zA-Z0-9]{3,20}$/.test(username);
        
        validation.className = `validation-icon ${isValid ? 'valid' : 'invalid'}`;
        validation.textContent = isValid ? '✓' : '✗';
        
        this.updateNextButton();
        this.analytics.logEvent('signup', 'username_validate', { valid: isValid });
    }

    validateEmail() {
        const email = document.getElementById('email').value;
        const validation = document.getElementById('email-validation');
        const isValid = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email);
        
        validation.className = `validation-icon ${isValid ? 'valid' : 'invalid'}`;
        validation.textContent = isValid ? '✓' : '✗';
        
        this.updateNextButton();
        this.analytics.logEvent('signup', 'email_validate', { valid: isValid });
    }

    validateLoginEmail() {
        const email = document.getElementById('login-email').value;
        const validation = document.getElementById('login-email-validation');
        const isValid = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email);
        
        validation.className = `validation-icon ${isValid ? 'valid' : 'invalid'}`;
        validation.textContent = isValid ? '✓' : '✗';
        
        this.analytics.logEvent('login', 'email_validate', { valid: isValid });
    }

    updateNextButton() {
        const username = document.getElementById('username').value;
        const email = document.getElementById('email').value;
        const usernameValid = /^[a-zA-Z0-9]{3,20}$/.test(username);
        const emailValid = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email);
        
        document.getElementById('next-step').disabled = !(usernameValid && emailValid);
    }

    nextSignupStep() {
        this.signupStep = 2;
        this.updateSignupProgress();
        
        // Hide step 1, show step 2
        document.getElementById('signup-step1').classList.remove('active');
        document.getElementById('signup-step2').classList.add('active');
        
        // Update initials preview
        const username = document.getElementById('username').value;
        const initials = username.substring(0, 2).toUpperCase();
        document.getElementById('initials-preview').textContent = initials;
        
        this.analytics.logEvent('signup', 'step_complete', { step: 1 });
    }

    selectProfilePic(option) {
        // Remove selection from all options
        document.querySelectorAll('.profile-pic-option').forEach(opt => {
            opt.classList.remove('selected');
        });
        
        // Add selection to clicked option
        option.classList.add('selected');
        this.selectedProfilePic = option.dataset.type;
        
        this.analytics.logEvent('signup', 'profile_pic_select', { type: this.selectedProfilePic });
    }

    skipStep2() {
        this.completeSignup();
        this.analytics.logEvent('signup', 'step_skip', { step: 2 });
    }

    completeSignup() {
        const username = document.getElementById('username').value;
        const email = document.getElementById('email').value;
        const phone = document.getElementById('phone').value;
        const addToHome = document.getElementById('add-to-home').checked;
        const stayLoggedIn = document.getElementById('stay-logged-in').checked;

        // Create user object
        this.currentUser = {
            id: this.generateUserId(),
            username,
            email,
            phone,
            profilePic: this.selectedProfilePic,
            addToHome,
            stayLoggedIn,
            createdAt: new Date().toISOString()
        };

        // Save to localStorage
        localStorage.setItem('pourChoicesUser', JSON.stringify(this.currentUser));
        localStorage.setItem('pourChoicesRemember', stayLoggedIn.toString());

        // Close modal and show search screen
        this.closeModal('signup-modal');
        this.showScreen('search');
        this.showToast('Welcome to the cellar!', 'success');
        
        this.analytics.logEvent('signup', 'complete', { 
            username, 
            hasPhone: !!phone,
            addToHome,
            stayLoggedIn 
        });
    }

    submitLogin() {
        const email = document.getElementById('login-email').value;
        
        // Check if user exists (in real app, this would be API call)
        const savedUser = localStorage.getItem('pourChoicesUser');
        if (savedUser) {
            this.currentUser = JSON.parse(savedUser);
            this.closeModal('login-modal');
            this.showScreen('search');
            this.showToast('Welcome back!', 'success');
            this.analytics.logEvent('login', 'success', { email });
        } else {
            this.showToast('Account not found. Please sign up first.', 'error');
            this.analytics.logEvent('login', 'fail', { email, reason: 'not_found' });
        }
    }

    // Workflow 2: Search Database
    loadSearchScreen() {
        const searchInput = document.getElementById('search-input');
        if (!searchInput.value) {
            document.getElementById('pre-search-overlay').classList.remove('hidden');
            document.getElementById('search-results').innerHTML = '';
            document.getElementById('no-results').classList.add('hidden');
        }
    }

    performSearch() {
        const query = document.getElementById('search-input').value.trim();
        if (!query) return;

        this.showLoading();
        this.analytics.logEvent('search', 'query', { query });

        // Simulate API call
        setTimeout(() => {
            const results = this.searchBottles(query);
            this.currentSearchResults = results;
            this.applyFiltersAndSort();
            this.hideLoading();
        }, 500);
    }

    searchBottles(query) {
        const searchTerm = query.toLowerCase();
        return this.bottles.filter(bottle => 
            bottle.name.toLowerCase().includes(searchTerm) ||
            bottle.distillery.toLowerCase().includes(searchTerm) ||
            bottle.type.toLowerCase().includes(searchTerm)
        );
    }

    displaySearchResults(results) {
        const preSearchOverlay = document.getElementById('pre-search-overlay');
        const searchResults = document.getElementById('search-results');
        const noResults = document.getElementById('no-results');

        preSearchOverlay.classList.add('hidden');

        if (results.length === 0) {
            searchResults.innerHTML = '';
            noResults.classList.remove('hidden');
        } else {
            noResults.classList.add('hidden');
            searchResults.innerHTML = results.map(bottle => this.createSlimCard(bottle)).join('');
        }

        this.analytics.logEvent('search', 'results_display', { count: results.length });
    }

    sortSearchResults() {
        const sortValue = document.getElementById('search-sort').value;
        this.currentSort = sortValue;
        this.applyFiltersAndSort();
        this.analytics.logEvent('search', 'sort', { sort: sortValue });
    }

    showSearchFilterModal() {
        this.showModal('search-filter-modal');
        this.analytics.logEvent('search', 'filter_modal_open');
    }

    setupRangeSliders() {
        // Your ranking range sliders
        const yourRankMin = document.getElementById('filter-your-rank-min');
        const yourRankMax = document.getElementById('filter-your-rank-max');
        const yourRankMinLabel = document.getElementById('your-rank-min-label');
        const yourRankMaxLabel = document.getElementById('your-rank-max-label');

        yourRankMin.addEventListener('input', () => {
            const value = parseInt(yourRankMin.value);
            yourRankMinLabel.textContent = value;
            if (value > parseInt(yourRankMax.value)) {
                yourRankMax.value = value;
                yourRankMaxLabel.textContent = value;
            }
        });

        yourRankMax.addEventListener('input', () => {
            const value = parseInt(yourRankMax.value);
            yourRankMaxLabel.textContent = value;
            if (value < parseInt(yourRankMin.value)) {
                yourRankMin.value = value;
                yourRankMinLabel.textContent = value;
            }
        });

        // Global ranking range sliders
        const globalRankMin = document.getElementById('filter-global-rank-min');
        const globalRankMax = document.getElementById('filter-global-rank-max');
        const globalRankMinLabel = document.getElementById('global-rank-min-label');
        const globalRankMaxLabel = document.getElementById('global-rank-max-label');

        globalRankMin.addEventListener('input', () => {
            const value = parseInt(globalRankMin.value);
            globalRankMinLabel.textContent = value;
            if (value > parseInt(globalRankMax.value)) {
                globalRankMax.value = value;
                globalRankMaxLabel.textContent = value;
            }
        });

        globalRankMax.addEventListener('input', () => {
            const value = parseInt(globalRankMax.value);
            globalRankMaxLabel.textContent = value;
            if (value < parseInt(globalRankMin.value)) {
                globalRankMin.value = value;
                globalRankMinLabel.textContent = value;
            }
        });
    }

    applySearchFilters() {
        // Get filter values
        this.currentFilters = {
            name: document.getElementById('filter-name').value.toLowerCase(),
            distillery: document.getElementById('filter-distillery').value.toLowerCase(),
            type: document.getElementById('filter-type').value,
            yourRankMin: parseInt(document.getElementById('filter-your-rank-min').value),
            yourRankMax: parseInt(document.getElementById('filter-your-rank-max').value),
            globalRankMin: parseInt(document.getElementById('filter-global-rank-min').value),
            globalRankMax: parseInt(document.getElementById('filter-global-rank-max').value)
        };

        this.closeModal('search-filter-modal');
        this.applyFiltersAndSort();
        this.showToast('Filters applied!', 'success');
        this.analytics.logEvent('search', 'filters_apply', this.currentFilters);
    }

    clearSearchFilters() {
        // Reset filter inputs
        document.getElementById('filter-name').value = '';
        document.getElementById('filter-distillery').value = '';
        document.getElementById('filter-type').value = '';
        document.getElementById('filter-your-rank-min').value = '0';
        document.getElementById('filter-your-rank-max').value = '100';
        document.getElementById('filter-global-rank-min').value = '0';
        document.getElementById('filter-global-rank-max').value = '100';
        
        // Update labels
        document.getElementById('your-rank-min-label').textContent = '0';
        document.getElementById('your-rank-max-label').textContent = '100';
        document.getElementById('global-rank-min-label').textContent = '0';
        document.getElementById('global-rank-max-label').textContent = '100';

        // Reset filters
        this.currentFilters = {
            name: '',
            distillery: '',
            type: '',
            yourRankMin: 0,
            yourRankMax: 100,
            globalRankMin: 0,
            globalRankMax: 100
        };

        this.applyFiltersAndSort();
        this.showToast('Filters cleared!', 'success');
        this.analytics.logEvent('search', 'filters_clear');
    }

    applyFiltersAndSort() {
        let filteredResults = [...this.currentSearchResults];

        // Apply filters
        filteredResults = filteredResults.filter(bottle => {
            // Name filter
            if (this.currentFilters.name && !bottle.name.toLowerCase().includes(this.currentFilters.name)) {
                return false;
            }

            // Distillery filter
            if (this.currentFilters.distillery && !bottle.distillery.toLowerCase().includes(this.currentFilters.distillery)) {
                return false;
            }

            // Type filter
            if (this.currentFilters.type && bottle.type !== this.currentFilters.type) {
                return false;
            }

            // Ranking filters
            const userRank = this.getUserRanking(bottle.id);
            const globalRank = this.getGlobalRanking(bottle.id);

            if (userRank < this.currentFilters.yourRankMin || userRank > this.currentFilters.yourRankMax) {
                return false;
            }

            if (globalRank < this.currentFilters.globalRankMin || globalRank > this.currentFilters.globalRankMax) {
                return false;
            }

            return true;
        });

        // Apply sorting
        filteredResults.sort((a, b) => {
            if (this.currentSort === 'your') {
                const aRank = this.getUserRanking(a.id);
                const bRank = this.getUserRanking(b.id);
                return bRank - aRank; // Highest first
            } else {
                const aRank = this.getGlobalRanking(a.id);
                const bRank = this.getGlobalRanking(b.id);
                return bRank - aRank; // Highest first
            }
        });

        this.displaySearchResults(filteredResults);
    }

    createSlimCard(bottle) {
        const userRank = this.getUserRanking(bottle.id);
        const globalRank = this.getGlobalRanking(bottle.id);
        
        return `
            <div class="slim-card" onclick="app.showBottleDetails('${bottle.id}')">
                <div class="slim-card-thumbnail">${bottle.emoji}</div>
                <div class="slim-card-content">
                    <div class="slim-card-name">${bottle.name}</div>
                    <div class="slim-card-distillery">${bottle.distillery}</div>
                    <div class="slim-card-badges">
                        <span class="badge your-rank">Your: ${userRank}/100</span>
                        <span class="badge global-rank">Global: ${globalRank}/100</span>
                    </div>
                </div>
            </div>
        `;
    }

    showBottleDetails(bottleId) {
        const bottle = this.bottles.find(b => b.id === bottleId);
        if (!bottle) return;

        const modal = document.getElementById('bottle-details-modal');
        modal.querySelector('.bottle-name').textContent = bottle.name;
        modal.querySelector('.bottle-distillery').textContent = bottle.distillery;
        modal.querySelector('.bottle-image').src = bottle.image || '';
        modal.querySelector('.bottle-image').alt = bottle.name;
        
        const userRank = this.getUserRanking(bottleId);
        const globalRank = this.getGlobalRanking(bottleId);
        modal.querySelector('.your-rank .rank-value').textContent = `${userRank}/100`;
        modal.querySelector('.global-rank .rank-value').textContent = `${globalRank}/100`;

        this.showModal('bottle-details-modal');
        this.analytics.logEvent('search', 'bottle_details', { bottleId });
    }

    showAddBottleModal() {
        this.showModal('add-bottle-modal');
        this.analytics.logEvent('add_bottle', 'modal_open');
    }

    handleBottleTypeChange() {
        const typeSelect = document.getElementById('bottle-type');
        const otherInput = document.getElementById('bottle-type-other');
        
        if (typeSelect.value === 'Other') {
            otherInput.classList.remove('hidden');
        } else {
            otherInput.classList.add('hidden');
        }
    }

    submitAddBottle(e) {
        e.preventDefault();
        
        const name = document.getElementById('bottle-name').value;
        const distillery = document.getElementById('bottle-distillery').value;
        const type = document.getElementById('bottle-type').value;
        const typeOther = document.getElementById('bottle-type-other').value;
        const finalType = type === 'Other' ? typeOther : type;

        if (!name || !distillery || !finalType) {
            this.showToast('Please fill in all required fields', 'error');
            return;
        }

        // Check for duplicates
        const duplicate = this.bottles.find(bottle => 
            bottle.name.toLowerCase() === name.toLowerCase() &&
            bottle.distillery.toLowerCase() === distillery.toLowerCase()
        );

        if (duplicate) {
            this.showToast('Similar bottle already exists. Admin will review your submission.', 'warning');
        }

        // Create new bottle
        const newBottle = {
            id: this.generateBottleId(),
            name,
            distillery,
            type: finalType,
            status: 'pending',
            addedBy: this.currentUser.id,
            addedAt: new Date().toISOString(),
            emoji: this.getBottleEmoji(finalType)
        };

        this.bottles.push(newBottle);
        this.closeModal('add-bottle-modal');
        this.showToast('Bottle added for review!', 'success');
        
        // Reset form
        document.querySelector('.add-bottle-form').reset();
        document.getElementById('bottle-type-other').classList.add('hidden');

        this.analytics.logEvent('add_bottle', 'submit', { 
            name, 
            distillery, 
            type: finalType,
            isDuplicate: !!duplicate 
        });
    }

    addToCollection() {
        const modal = document.getElementById('bottle-details-modal');
        const bottleName = modal.querySelector('.bottle-name').textContent;
        const bottle = this.bottles.find(b => b.name === bottleName);
        
        if (!bottle) return;

        // Check if already in collection
        const existing = this.userCollection.find(item => item.bottleId === bottle.id);
        if (existing) {
            this.showToast('Bottle already in your collection', 'warning');
            return;
        }

        // Add to collection
        const collectionItem = {
            id: this.generateCollectionId(),
            bottleId: bottle.id,
            userId: this.currentUser.id,
            volume: 100,
            numberOwned: 1,
            notes: '',
            addedAt: new Date().toISOString()
        };

        this.userCollection.push(collectionItem);
        this.closeModal('bottle-details-modal');
        this.showToast('Added to your bar!', 'success');
        
        this.analytics.logEvent('collection', 'add', { bottleId: bottle.id });
    }

    // Workflow 5: My Bar Collection
    loadMyBarScreen() {
        const barCount = this.userCollection.length;
        document.getElementById('bar-count').textContent = barCount;
        
        if (barCount === 0) {
            document.getElementById('mybar-results').innerHTML = '';
            document.getElementById('mybar-empty').classList.remove('hidden');
        } else {
            document.getElementById('mybar-empty').classList.add('hidden');
            this.displayMyBarResults();
        }
    }

    displayMyBarResults() {
        const resultsContainer = document.getElementById('mybar-results');
        const results = this.userCollection.map(item => {
            const bottle = this.bottles.find(b => b.id === item.bottleId);
            if (!bottle) return '';
            
            const userRank = this.getUserRanking(bottle.id);
            return this.createMediumCard(bottle, item, userRank);
        }).filter(card => card).join('');

        resultsContainer.innerHTML = results;
    }

    createMediumCard(bottle, collectionItem, userRank) {
        return `
            <div class="medium-card" onclick="app.editBottle('${collectionItem.id}')">
                <div class="medium-card-thumbnail">${bottle.emoji}</div>
                <div class="medium-card-content">
                    <div class="medium-card-name">${bottle.name}</div>
                    <div class="medium-card-details">${bottle.distillery} • ${bottle.type}</div>
                    <div class="medium-card-volume">
                        <span>📊</span>
                        <span>${collectionItem.volume}% • ${collectionItem.numberOwned} owned</span>
                    </div>
                    <div class="slim-card-badges">
                        <span class="badge your-rank">Your: ${userRank}/100</span>
                    </div>
                </div>
            </div>
        `;
    }

    editBottle(collectionId) {
        const collectionItem = this.userCollection.find(item => item.id === collectionId);
        const bottle = this.bottles.find(b => b.id === collectionItem.bottleId);
        
        if (!collectionItem || !bottle) return;

        const modal = document.getElementById('edit-bottle-modal');
        modal.querySelector('.edit-bottle-name').textContent = bottle.name;
        modal.querySelector('.bottle-distillery').textContent = bottle.distillery;
        modal.querySelector('.bottle-type').textContent = bottle.type;
        modal.querySelector('.bottle-image').src = bottle.image || '';
        modal.querySelector('.bottle-image').alt = bottle.name;
        
        document.getElementById('edit-volume').value = collectionItem.volume;
        document.getElementById('edit-number-owned').value = collectionItem.numberOwned;
        document.getElementById('edit-notes').value = collectionItem.notes;
        this.updateCharCounter();

        this.showModal('edit-bottle-modal');
        this.analytics.logEvent('mybar', 'edit_open', { collectionId });
    }

    saveBottleEdit() {
        const modal = document.getElementById('edit-bottle-modal');
        const bottleName = modal.querySelector('.edit-bottle-name').textContent;
        const bottle = this.bottles.find(b => b.name === bottleName);
        const collectionItem = this.userCollection.find(item => item.bottleId === bottle.id);
        
        if (!collectionItem) return;

        collectionItem.volume = parseInt(document.getElementById('edit-volume').value);
        collectionItem.numberOwned = parseInt(document.getElementById('edit-number-owned').value);
        collectionItem.notes = document.getElementById('edit-notes').value;

        this.closeModal('edit-bottle-modal');
        this.displayMyBarResults();
        this.showToast('Pour updated!', 'success');
        
        this.analytics.logEvent('mybar', 'edit_save', { 
            collectionId: collectionItem.id,
            volume: collectionItem.volume,
            numberOwned: collectionItem.numberOwned,
            hasNotes: !!collectionItem.notes
        });
    }

    updateVolumeDisplay() {
        const volume = document.getElementById('edit-volume').value;
        // Could add visual feedback here
    }

    adjustNumberOwned(delta) {
        const input = document.getElementById('edit-number-owned');
        const currentValue = parseInt(input.value) || 0;
        const newValue = Math.max(0, Math.min(999, currentValue + delta));
        input.value = newValue;
        
        if (newValue === 0 || newValue === 999) {
            this.showToast(newValue === 0 ? 'Min 0!' : 'Max 999!', 'error');
        }
    }

    updateCharCounter() {
        const textarea = document.getElementById('edit-notes');
        const counter = document.querySelector('.char-counter');
        const length = textarea.value.length;
        counter.textContent = `${length}/250`;
    }

    searchMyBar() {
        const query = document.getElementById('mybar-search').value.toLowerCase();
        const filtered = this.userCollection.filter(item => {
            const bottle = this.bottles.find(b => b.id === item.bottleId);
            return bottle && (
                bottle.name.toLowerCase().includes(query) ||
                bottle.distillery.toLowerCase().includes(query) ||
                bottle.type.toLowerCase().includes(query)
            );
        });

        const resultsContainer = document.getElementById('mybar-results');
        const results = filtered.map(item => {
            const bottle = this.bottles.find(b => b.id === item.bottleId);
            const userRank = this.getUserRanking(bottle.id);
            return this.createMediumCard(bottle, item, userRank);
        }).join('');

        resultsContainer.innerHTML = results;
        this.analytics.logEvent('mybar', 'search', { query, results: filtered.length });
    }

    // Profile Screen
    loadProfileScreen() {
        if (!this.currentUser) return;

        document.getElementById('profile-username').textContent = this.currentUser.username;
        document.getElementById('profile-email').textContent = this.currentUser.email;
        document.getElementById('profile-pic-display').textContent = this.getProfilePicEmoji(this.currentUser.profilePic);
        
        // Calculate stats
        const totalTastings = this.tastings.filter(t => t.userId === this.currentUser.id).length;
        const totalBottles = this.userCollection.length;
        const avgRating = this.calculateAverageRating();

        document.getElementById('total-tastings').textContent = totalTastings;
        document.getElementById('total-bottles').textContent = totalBottles;
        document.getElementById('avg-rating').textContent = avgRating;
    }

    // Navigation
    navigateToScreen(screenName) {
        if (!this.currentUser && screenName !== 'welcome') {
            this.showToast('Please sign up or log in first', 'error');
            return;
        }
        this.showScreen(screenName);
    }

    // Coming Soon functionality
    showComingSoon(feature) {
        this.showScreen('coming-soon');
        this.showToast(`Feature aging in the barrel—check back soon!`, 'warning');
        this.analytics.logEvent('coming_soon', 'view', { feature });
    }

    hideComingSoon() {
        this.showScreen(this.currentScreen);
    }

    // Utility functions
    generateUserId() {
        return 'user_' + Math.random().toString(36).substr(2, 9);
    }

    generateBottleId() {
        return 'bottle_' + Math.random().toString(36).substr(2, 9);
    }

    generateCollectionId() {
        return 'collection_' + Math.random().toString(36).substr(2, 9);
    }

    getBottleEmoji(type) {
        const emojis = {
            'Blended': '🥃',
            'Bourbon': '🥃',
            'Single Malt': '🥃',
            'Rye': '🌾',
            'Other': '🍺'
        };
        return emojis[type] || '🥃';
    }

    getProfilePicEmoji(type) {
        const emojis = {
            'whiskey-glass': '🥃',
            'oak-barrel': '🛢️',
            'rye-stalk': '🌾',
            'cork-popper': '🍾',
            'tumbler': '🥃',
            'copper-still': '⚗️',
            'amber-bottle': '🍯',
            'ice-cube': '🧊',
            'cigar-smoke': '💨',
            'lime-wedge': '🍋',
            'distillery-machine': '⚙️',
            'barrel-tap': '🚰'
        };
        return emojis[type] || '🥃';
    }

    getUserRanking(bottleId) {
        // Simulate user ranking (in real app, this would be calculated from tastings)
        return Math.floor(Math.random() * 100);
    }

    getGlobalRanking(bottleId) {
        // Simulate global ranking (in real app, this would be calculated from all users)
        return Math.floor(Math.random() * 100);
    }

    calculateAverageRating() {
        // Simulate average rating calculation
        const userTastings = this.tastings.filter(t => t.userId === this.currentUser.id);
        if (userTastings.length === 0) return '--';
        return Math.floor(Math.random() * 100);
    }

    // Toast system
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    // Loading states
    showLoading() {
        document.getElementById('loading-spinner').classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loading-spinner').classList.add('hidden');
    }

    // Blind Tastings functionality
    setupTastingEventListeners() {
        // Selection tray
        document.getElementById('add-bottles-btn').addEventListener('click', () => this.addBottlesToTasting());
        document.getElementById('start-tasting-btn').addEventListener('click', () => this.proceedToPourer());

        // Pourer screen
        document.getElementById('randomize-btn').addEventListener('click', () => this.randomizeAssignments());
        document.getElementById('complete-pourer-btn').addEventListener('click', () => this.proceedToTaster());

        // Taster screen
        document.querySelectorAll('.bottle-silhouette').forEach(silhouette => {
            silhouette.addEventListener('click', () => this.switchBottle(silhouette.dataset.bottle));
        });

        document.querySelectorAll('.section-header').forEach(header => {
            header.addEventListener('click', () => this.toggleSection(header.dataset.section));
        });

        document.querySelectorAll('.add-flavor-btn').forEach(btn => {
            btn.addEventListener('click', () => this.showFlavorPanel(btn.dataset.section));
        });

        document.querySelectorAll('.back-btn').forEach(btn => {
            btn.addEventListener('click', () => this.hideFlavorPanel());
        });

        document.querySelectorAll('.rank-select').forEach(select => {
            select.addEventListener('change', () => this.updateRanking());
        });

        document.getElementById('finish-tasting-btn').addEventListener('click', () => this.proceedToReveal());

        // Reveal screen
        document.getElementById('save-tasting-btn').addEventListener('click', () => this.saveTasting());
    }

    startTasting() {
        const modal = document.getElementById('bottle-details-modal');
        const bottleName = modal.querySelector('.bottle-name').textContent;
        const bottle = this.bottles.find(b => b.name === bottleName);
        
        if (!bottle) return;

        // Initialize tasting
        this.currentTasting = {
            id: this.generateTastingId(),
            userId: this.currentUser.id,
            bottles: [bottle],
            assignments: {},
            notes: {},
            ranks: {},
            createdAt: new Date().toISOString()
        };

        this.selectedBottles = [bottle];
        this.currentTastingStep = 'selection';
        
        this.closeModal('bottle-details-modal');
        this.showScreen('tasting');
        this.updateSelectionTray();
        
        this.analytics.logEvent('tasting', 'start', { bottleId: bottle.id });
    }

    addBottlesToTasting() {
        // For MVP, we'll use a simple approach - add from collection
        const availableBottles = this.userCollection
            .map(item => this.bottles.find(b => b.id === item.bottleId))
            .filter(bottle => bottle && !this.selectedBottles.find(selected => selected.id === bottle.id));

        if (availableBottles.length === 0) {
            this.showToast('No more bottles available in your collection', 'warning');
            return;
        }

        // Add first available bottle (in real app, this would be a selection modal)
        const bottleToAdd = availableBottles[0];
        this.selectedBottles.push(bottleToAdd);
        this.currentTasting.bottles.push(bottleToAdd);
        
        this.updateSelectionTray();
        this.analytics.logEvent('tasting', 'add_bottle', { bottleId: bottleToAdd.id });
    }

    updateSelectionTray() {
        const count = this.selectedBottles.length;
        document.getElementById('bottles-ready').textContent = `${count}/5 Bottles Ready`;
        document.getElementById('tray-progress').style.width = `${(count / 5) * 100}%`;
        
        const startBtn = document.getElementById('start-tasting-btn');
        startBtn.disabled = count < 2;
        
        // Update selected bottles display
        const container = document.getElementById('selected-bottles');
        container.innerHTML = this.selectedBottles.map((bottle, index) => `
            <div class="selected-bottle-card" data-index="${index}">
                <button class="remove-btn" onclick="app.removeBottleFromTasting(${index})">×</button>
                <div class="selected-bottle-thumbnail">${bottle.emoji}</div>
                <div class="selected-bottle-name">${bottle.name}</div>
            </div>
        `).join('');
    }

    removeBottleFromTasting(index) {
        this.selectedBottles.splice(index, 1);
        this.currentTasting.bottles.splice(index, 1);
        this.updateSelectionTray();
        this.analytics.logEvent('tasting', 'remove_bottle', { index });
    }

    proceedToPourer() {
        this.currentTastingStep = 'pourer';
        this.showTastingSubscreen('pourer-screen');
        this.setupDraggableBottles();
        this.analytics.logEvent('tasting', 'proceed_to_pourer');
    }

    setupDraggableBottles() {
        const container = document.getElementById('draggable-bottles');
        container.innerHTML = this.selectedBottles.map((bottle, index) => `
            <div class="draggable-bottle" draggable="true" data-bottle-id="${bottle.id}">
                <div class="selected-bottle-thumbnail">${bottle.emoji}</div>
                <div class="selected-bottle-name">${bottle.name}</div>
            </div>
        `).join('');

        // Setup drag and drop
        this.setupDragAndDrop();
    }

    setupDragAndDrop() {
        const draggableBottles = document.querySelectorAll('.draggable-bottle');
        const dropZones = document.querySelectorAll('.drop-zone');

        draggableBottles.forEach(bottle => {
            bottle.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', bottle.dataset.bottleId);
                bottle.classList.add('dragging');
            });

            bottle.addEventListener('dragend', () => {
                bottle.classList.remove('dragging');
            });
        });

        dropZones.forEach(zone => {
            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                zone.classList.add('drag-over');
            });

            zone.addEventListener('dragleave', () => {
                zone.classList.remove('drag-over');
            });

            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                const bottleId = e.dataTransfer.getData('text/plain');
                const slot = zone.dataset.slot;
                
                this.assignBottleToSlot(bottleId, slot);
                zone.classList.remove('drag-over');
            });
        });
    }

    assignBottleToSlot(bottleId, slot) {
        const bottle = this.bottles.find(b => b.id === bottleId);
        if (!bottle) return;

        this.tastingAssignments[slot] = bottle;
        
        // Update drop zone
        const dropZone = document.querySelector(`[data-slot="${slot}"]`);
        dropZone.classList.add('occupied');
        dropZone.innerHTML = `
            <div class="selected-bottle-thumbnail">${bottle.emoji}</div>
            <span class="slot-label">${slot}</span>
        `;

        // Remove from draggable bottles
        const draggableBottle = document.querySelector(`[data-bottle-id="${bottleId}"]`);
        if (draggableBottle) {
            draggableBottle.remove();
        }

        this.updatePourerCompleteButton();
        this.analytics.logEvent('tasting', 'assign_bottle', { bottleId, slot });
    }

    randomizeAssignments() {
        const shuffledBottles = [...this.selectedBottles].sort(() => Math.random() - 0.5);
        const slots = ['A', 'B', 'C', 'D', 'E'];
        
        // Clear existing assignments
        this.tastingAssignments = {};
        document.querySelectorAll('.drop-zone').forEach(zone => {
            zone.classList.remove('occupied');
            zone.innerHTML = `
                <div class="glass-icon">🥃</div>
                <span class="slot-label">${zone.dataset.slot}</span>
            `;
        });

        // Assign bottles to slots
        shuffledBottles.forEach((bottle, index) => {
            if (index < slots.length) {
                this.assignBottleToSlot(bottle.id, slots[index]);
            }
        });

        this.analytics.logEvent('tasting', 'randomize');
    }

    updatePourerCompleteButton() {
        const assignedCount = Object.keys(this.tastingAssignments).length;
        const totalBottles = this.selectedBottles.length;
        const completeBtn = document.getElementById('complete-pourer-btn');
        
        completeBtn.disabled = assignedCount < totalBottles;
    }

    proceedToTaster() {
        this.currentTastingStep = 'taster';
        this.showTastingSubscreen('taster-screen');
        this.initializeTastingNotes();
        this.analytics.logEvent('tasting', 'proceed_to_taster');
    }

    showTastingSubscreen(subscreenId) {
        document.querySelectorAll('.tasting-subscreen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(subscreenId).classList.add('active');
    }

    initializeTastingNotes() {
        const slots = Object.keys(this.tastingAssignments);
        this.tastingNotes = {};
        this.tastingRanks = {};
        
        slots.forEach(slot => {
            this.tastingNotes[slot] = {
                nose: { flavors: [], custom: '' },
                taste: { flavors: [], custom: '' },
                finish: { flavors: [], custom: '' }
            };
            this.tastingRanks[slot] = null;
        });

        // Update ranking selects
        this.updateRankingSelects();
    }

    switchBottle(bottleSlot) {
        this.currentBottle = bottleSlot;
        
        // Update active silhouette
        document.querySelectorAll('.bottle-silhouette').forEach(sil => {
            sil.classList.remove('active');
        });
        document.querySelector(`[data-bottle="${bottleSlot}"]`).classList.add('active');
        
        this.analytics.logEvent('tasting', 'switch_bottle', { slot: bottleSlot });
    }

    toggleSection(section) {
        const header = document.querySelector(`[data-section="${section}"]`);
        const content = document.getElementById(`${section}-content`);
        
        header.classList.toggle('collapsed');
        content.classList.toggle('collapsed');
        
        this.analytics.logEvent('tasting', 'toggle_section', { section });
    }

    showFlavorPanel(section) {
        const panel = document.getElementById(`${section}-panel`);
        panel.classList.add('active');
        this.populateFlavorSuggestions(section);
        this.analytics.logEvent('tasting', 'show_flavor_panel', { section });
    }

    hideFlavorPanel() {
        document.querySelectorAll('.flavor-panel').forEach(panel => {
            panel.classList.remove('active');
        });
    }

    populateFlavorSuggestions(section) {
        const container = document.getElementById(`${section}-suggestions`);
        const searchInput = document.getElementById(`${section}-search`);
        
        const updateSuggestions = (query = '') => {
            const filtered = this.flavorSuggestions.filter(flavor => 
                flavor.toLowerCase().includes(query.toLowerCase())
            );
            
            container.innerHTML = filtered.map(flavor => `
                <div class="flavor-suggestion" onclick="app.addFlavor('${section}', '${flavor}')">
                    ${flavor}
                </div>
            `).join('');
        };

        searchInput.addEventListener('input', (e) => {
            updateSuggestions(e.target.value);
        });

        updateSuggestions();
    }

    addFlavor(section, flavor) {
        if (!this.tastingNotes[this.currentBottle]) {
            this.tastingNotes[this.currentBottle] = {
                nose: { flavors: [], custom: '' },
                taste: { flavors: [], custom: '' },
                finish: { flavors: [], custom: '' }
            };
        }

        const flavors = this.tastingNotes[this.currentBottle][section].flavors;
        if (!flavors.includes(flavor)) {
            flavors.push(flavor);
            this.updateFlavorChips(section);
        }
        
        this.analytics.logEvent('tasting', 'add_flavor', { section, flavor });
    }

    removeFlavor(section, flavor) {
        if (this.tastingNotes[this.currentBottle]) {
            const flavors = this.tastingNotes[this.currentBottle][section].flavors;
            const index = flavors.indexOf(flavor);
            if (index > -1) {
                flavors.splice(index, 1);
                this.updateFlavorChips(section);
            }
        }
    }

    updateFlavorChips(section) {
        const container = document.querySelector(`#${section}-selected .flavor-chips`);
        const flavors = this.tastingNotes[this.currentBottle]?.[section]?.flavors || [];
        
        container.innerHTML = flavors.map(flavor => `
            <div class="flavor-chip">
                ${flavor}
                <button class="remove-chip" onclick="app.removeFlavor('${section}', '${flavor}')">×</button>
            </div>
        `).join('');
    }

    updateRankingSelects() {
        const slots = Object.keys(this.tastingAssignments);
        document.querySelectorAll('.rank-select').forEach(select => {
            select.innerHTML = '<option value="">Select bottle</option>';
            slots.forEach(slot => {
                const bottle = this.tastingAssignments[slot];
                const option = document.createElement('option');
                option.value = slot;
                option.textContent = `${slot}: ${bottle.name}`;
                select.appendChild(option);
            });
        });
    }

    updateRanking() {
        const selects = document.querySelectorAll('.rank-select');
        const ranks = {};
        
        selects.forEach(select => {
            if (select.value) {
                ranks[select.value] = parseInt(select.closest('.rank-item').dataset.rank);
            }
        });

        this.tastingRanks = ranks;
        this.updateFinishButton();
        this.analytics.logEvent('tasting', 'update_ranking', { ranks });
    }

    updateFinishButton() {
        const assignedCount = Object.keys(this.tastingAssignments).length;
        const rankedCount = Object.keys(this.tastingRanks).length;
        const finishBtn = document.getElementById('finish-tasting-btn');
        
        finishBtn.disabled = rankedCount < assignedCount;
    }

    proceedToReveal() {
        this.currentTastingStep = 'reveal';
        this.showTastingSubscreen('reveal-screen');
        this.performReveal();
        this.analytics.logEvent('tasting', 'proceed_to_reveal');
    }

    performReveal() {
        const revealContainer = document.querySelector('.reveal-bottles');
        const slots = Object.keys(this.tastingAssignments).sort().reverse(); // E to A
        
        revealContainer.innerHTML = '';
        
        slots.forEach((slot, index) => {
            setTimeout(() => {
                const bottle = this.tastingAssignments[slot];
                const rank = this.tastingRanks[slot];
                
                const revealBottle = document.createElement('div');
                revealBottle.className = 'reveal-bottle';
                revealBottle.innerHTML = `
                    <div class="reveal-bottle-thumbnail">${bottle.emoji}</div>
                    <div class="reveal-bottle-info">
                        <div class="reveal-bottle-name">${bottle.name}</div>
                        <div class="reveal-bottle-distillery">${bottle.distillery}</div>
                    </div>
                    <div class="reveal-bottle-rank">${this.getRankText(rank)}</div>
                `;
                
                revealContainer.appendChild(revealBottle);
            }, index * 300);
        });

        // Show scores after reveal
        setTimeout(() => {
            this.displayRevealScores();
        }, slots.length * 300 + 500);
    }

    getRankText(rank) {
        const rankTexts = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th' };
        return rankTexts[rank] || 'Unranked';
    }

    displayRevealScores() {
        const personalScores = document.getElementById('personal-scores');
        const globalScores = document.getElementById('global-scores');
        
        // Personal scores (from this tasting)
        const personalRankings = Object.entries(this.tastingRanks)
            .sort(([,a], [,b]) => a - b)
            .map(([slot, rank]) => {
                const bottle = this.tastingAssignments[slot];
                return { slot, rank, bottle };
            });

        personalScores.innerHTML = personalRankings.map(item => `
            <div class="score-item">
                <span>${this.getRankText(item.rank)}: ${item.bottle.name}</span>
                <span>${this.getUserRanking(item.bottle.id)}/100</span>
            </div>
        `).join('');

        // Global scores (simulated)
        const globalRankings = Object.values(this.tastingAssignments)
            .map(bottle => ({
                bottle,
                globalRank: this.getGlobalRanking(bottle.id)
            }))
            .sort((a, b) => b.globalRank - a.globalRank);

        globalScores.innerHTML = globalRankings.map(item => `
            <div class="score-item">
                <span>${item.bottle.name}</span>
                <span>${item.globalRank}/100</span>
            </div>
        `).join('');

        // Check for upset
        this.checkForUpset();
    }

    checkForUpset() {
        const personalTop = Object.entries(this.tastingRanks)
            .sort(([,a], [,b]) => a - b)[0];
        
        if (personalTop) {
            const bottle = this.tastingAssignments[personalTop[0]];
            const personalRank = this.getUserRanking(bottle.id);
            const globalRank = this.getGlobalRanking(bottle.id);
            
            if (personalRank > globalRank + 10) {
                document.getElementById('upset-alert').classList.remove('hidden');
            }
        }
    }

    saveTasting() {
        // Save tasting to local storage
        this.currentTasting.assignments = this.tastingAssignments;
        this.currentTasting.notes = this.tastingNotes;
        this.currentTasting.ranks = this.tastingRanks;
        this.currentTasting.completedAt = new Date().toISOString();
        
        this.tastings.push(this.currentTasting);
        localStorage.setItem('pourChoicesTastings', JSON.stringify(this.tastings));
        
        this.showToast('Tasting saved successfully!', 'success');
        this.showScreen('search');
        
        this.analytics.logEvent('tasting', 'save', { 
            tastingId: this.currentTasting.id,
            bottleCount: this.selectedBottles.length 
        });
    }

    generateTastingId() {
        return 'tasting_' + Math.random().toString(36).substr(2, 9);
    }

    // AI Photo Recognition functionality
    showAddBottleOptions() {
        // For MVP, we'll show a simple popup with options
        const options = [
            { text: '📷 Take Photo', action: () => this.showAIPhotoModal() },
            { text: '🔍 Search Database', action: () => this.showAddBottleModal() }
        ];

        // Create a simple popup
        const popup = document.createElement('div');
        popup.className = 'add-options-popup';
        popup.innerHTML = `
            <div class="popup-content">
                <h3>Add Bottle</h3>
                ${options.map(option => `
                    <button class="btn btn-secondary" onclick="app.${option.action.name}()">${option.text}</button>
                `).join('')}
                <button class="btn btn-secondary" onclick="this.closest('.add-options-popup').remove()">Cancel</button>
            </div>
        `;
        
        document.body.appendChild(popup);
        this.analytics.logEvent('mybar', 'add_options_show');
    }

    showAIPhotoModal() {
        // Remove any existing popup
        document.querySelector('.add-options-popup')?.remove();
        
        this.showModal('ai-photo-modal');
        this.resetPhotoRecognition();
        this.analytics.logEvent('ai_photo', 'modal_open');
    }

    resetPhotoRecognition() {
        // Show camera overlay, hide other states
        document.getElementById('camera-overlay').classList.remove('hidden');
        document.getElementById('recognition-processing').classList.add('hidden');
        document.getElementById('recognition-success').classList.add('hidden');
        document.getElementById('recognition-fail').classList.add('hidden');
    }

    capturePhoto() {
        // Simulate photo capture
        this.showPhotoProcessing();
        this.analytics.logEvent('ai_photo', 'capture_attempt');
        
        // Simulate AI recognition (in real app, this would call an API)
        setTimeout(() => {
            this.processPhotoRecognition();
        }, 2000);
    }

    showPhotoProcessing() {
        document.getElementById('camera-overlay').classList.add('hidden');
        document.getElementById('recognition-processing').classList.remove('hidden');
    }

    processPhotoRecognition() {
        // Simulate AI recognition with random results
        const confidence = Math.random();
        
        if (confidence > 0.7) {
            this.showRecognitionSuccess();
        } else {
            this.showRecognitionFail();
        }
        
        this.analytics.logEvent('ai_photo', 'recognition_result', { confidence });
    }

    showRecognitionSuccess() {
        document.getElementById('recognition-processing').classList.add('hidden');
        document.getElementById('recognition-success').classList.remove('hidden');
        
        // Pre-fill form with simulated AI results
        const sampleBottles = [
            { name: 'Glenfiddich 15', distillery: 'Glenfiddich Distillery', type: 'Single Malt' },
            { name: 'Macallan 12', distillery: 'Macallan Distillery', type: 'Single Malt' },
            { name: 'Woodford Reserve', distillery: 'Woodford Reserve Distillery', type: 'Bourbon' },
            { name: 'Johnnie Walker Black', distillery: 'Johnnie Walker', type: 'Blended' }
        ];
        
        const randomBottle = sampleBottles[Math.floor(Math.random() * sampleBottles.length)];
        
        document.getElementById('ai-bottle-name').value = randomBottle.name;
        document.getElementById('ai-bottle-distillery').value = randomBottle.distillery;
        document.getElementById('ai-bottle-type').value = randomBottle.type;
        
        this.showToast('Bottle recognized successfully!', 'success');
    }

    showRecognitionFail() {
        document.getElementById('recognition-processing').classList.add('hidden');
        document.getElementById('recognition-fail').classList.remove('hidden');
        this.showToast('No match found—try again with a clearer shot', 'error');
    }

    switchToManualAdd() {
        this.closeModal('ai-photo-modal');
        this.showAddBottleModal();
        this.analytics.logEvent('ai_photo', 'switch_to_manual');
    }

    submitAIBottle(e) {
        e.preventDefault();
        
        const name = document.getElementById('ai-bottle-name').value;
        const distillery = document.getElementById('ai-bottle-distillery').value;
        const type = document.getElementById('ai-bottle-type').value;

        if (!name || !distillery || !type) {
            this.showToast('Please fill in all required fields', 'error');
            return;
        }

        // Create new bottle
        const newBottle = {
            id: this.generateBottleId(),
            name,
            distillery,
            type,
            status: 'pending',
            addedBy: this.currentUser.id,
            addedAt: new Date().toISOString(),
            emoji: this.getBottleEmoji(type),
            source: 'ai_photo'
        };

        this.bottles.push(newBottle);
        
        // Add to collection automatically
        const collectionItem = {
            id: this.generateCollectionId(),
            bottleId: newBottle.id,
            userId: this.currentUser.id,
            volume: 100,
            numberOwned: 1,
            notes: '',
            addedAt: new Date().toISOString()
        };

        this.userCollection.push(collectionItem);
        
        this.closeModal('ai-photo-modal');
        this.showToast('Bottle added via AI recognition!', 'success');
        
        // Refresh My Bar if we're on that screen
        if (this.currentScreen === 'mybar') {
            this.loadMyBarScreen();
        }
        
        this.analytics.logEvent('ai_photo', 'submit_success', { 
            name, 
            distillery, 
            type 
        });
    }

    // Sample data for development
    loadSampleData() {
        this.bottles = [
            {
                id: 'bottle_1',
                name: 'Glenfiddich 12',
                distillery: 'Glenfiddich Distillery',
                type: 'Single Malt',
                emoji: '🥃',
                status: 'approved'
            },
            {
                id: 'bottle_2',
                name: 'Macallan 18',
                distillery: 'Macallan Distillery',
                type: 'Single Malt',
                emoji: '🥃',
                status: 'approved'
            },
            {
                id: 'bottle_3',
                name: 'Woodford Reserve',
                distillery: 'Woodford Reserve Distillery',
                type: 'Bourbon',
                emoji: '🥃',
                status: 'approved'
            },
            {
                id: 'bottle_4',
                name: 'Johnnie Walker Black',
                distillery: 'Johnnie Walker',
                type: 'Blended',
                emoji: '🥃',
                status: 'approved'
            },
            {
                id: 'bottle_5',
                name: 'Buffalo Trace',
                distillery: 'Buffalo Trace Distillery',
                type: 'Bourbon',
                emoji: '🥃',
                status: 'approved'
            }
        ];
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new PourChoicesApp();
});
