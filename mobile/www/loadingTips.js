// loadingTips.js
// Dynamic loading tips system with game mechanics explanations

/**
 * Loading Tips Manager - Provides engaging tips during initialization
 */
export class LoadingTipsManager {
    constructor() {
        this.currentTipIndex = 0;
        this.tipElement = null;
        this.progressElement = null;
        this.tipInterval = null;
        this.tipRotationTime = 3000; // 3 seconds per tip
        this.log = window.displayVisualError || console.log;
        
        // Comprehensive tips organized by category
        // Every tip describes something the game really does (the old list
        // promised factions, spell slots, components, rituals and weather).
        this.tips = {
            combat: [
                "Combat Tip: Fights go Attack, Special, Item, Defend, Run - pick one each turn!",
                "Combat Tip: Defend halves the damage you take until your next turn and gives back a little HP.",
                "Combat Tip: Bosses can't be escaped - and every other turn they hit the whole party.",
                "Combat Tip: Power Strike is a heavy blow you can use every other round.",
                "Combat Tip: Haste gives you a quick extra strike; Slow makes you lose every other turn.",
                "Combat Tip: A confused hero might hit themselves - clear it before a big attack.",
                "Combat Tip: Area spells hit every foe at once.",
                "Combat Tip: Weapons and armor in your Bag only help once you equip them!"
            ],
            spells: [
                "Ability Tip: Specials and spells cost MP, and MP slowly comes back every round.",
                "Ability Tip: Healing abilities land on your hero, not the enemy.",
                "Ability Tip: In worlds without magic, your powers come from tech, gear and know-how.",
                "Ability Tip: Leveling up unlocks stronger spells."
            ],
            progression: [
                "Stats Tip: The % on each choice is your chance - the icon shows which stat it uses.",
                "Stats Tip: Every point in a stat adds +5% to choices that use it.",
                "Stats Tip: Every choice gives XP - even a setback teaches you something.",
                "Stats Tip: Each level lets you raise a stat. Tap the star on your hero card to spend points.",
                "Stats Tip: Use a stat successfully 6 times and it grows by itself.",
                "Stats Tip: Brave adds attack, Sneaky dodges, Clever powers abilities, Kind heals more.",
                "Stats Tip: ⚠ means a choice can hurt if it fails, ⚠⚠ means it probably will - but it pays more.",
                "Stats Tip: 🍀 choices are absurd long shots - rarely work, but spectacular when they do. A lucky charm helps."
            ],
            items: [
                "Item Tip: Prices follow what an item does - a stronger sword costs more.",
                "Item Tip: The shop restocks every 5 turns, and its gear gets better as you level up.",
                "Item Tip: Sell what you don't need from your Bag for half its price.",
                "Item Tip: Rest at the inn (in the shop) for full HP and MP.",
                "Item Tip: Searching carefully can turn up hidden stashes, gear and the odd rare chest!",
                "Item Tip: Revival items bring back a downed ally - use them through Help Ally."
            ],
            exploration: [
                "World Tip: Story milestones give the whole party XP and coins.",
                "World Tip: If you're captured, find a weakness and escape - you'll get most of your gear back.",
                "World Tip: Your adventure theme shapes the people, places and powers you'll meet."
            ],
            story: [
                "Story Tip: The storyteller remembers the people, places and promises in your story.",
                "Story Tip: There's no single correct path - setbacks change the story instead of ending it.",
                "Story Tip: The quest is won by defeating the villain in battle.",
                "Story Tip: Win the quest to unlock God Mode: type anything and the world bends to you!",
                "Story Tip: Read the whole tale any time from Menu > Read the Story So Far."
            ],
            multiplayer: [
                "Party Tip: Heroes take turns - the choices panel says whose turn it is.",
                "Party Tip: XP from a fight is shared, so every hero levels at the same pace.",
                "Party Tip: Loot is shared out: one drop roll for each hero still standing.",
                "Party Tip: Use Help Ally to revive a downed friend with a revival item."
            ],
            gameplay: [
                "Gameplay Tip: Your game saves itself after every turn.",
                "Gameplay Tip: Android back opens the menu instead of closing the game.",
                "Gameplay Tip: Stuck on an AI key? Menu > AI Settings, even in the middle of a game."
            ]
        };
        
        // Flatten all tips into a single array for easy rotation
        this.allTips = [];
        Object.values(this.tips).forEach(categoryTips => {
            this.allTips.push(...categoryTips);
        });
        
        // Shuffle tips for variety
        this.shuffleTips();
    }
    
    /**
     * Shuffle the tips array for random order
     */
    shuffleTips() {
        for (let i = this.allTips.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.allTips[i], this.allTips[j]] = [this.allTips[j], this.allTips[i]];
        }
    }
    
    /**
     * Initialize the loading tips display
     */
    initializeTipsDisplay() {
        // Create or find the loading container
        let loadingContainer = document.querySelector('.loading-container');
        if (!loadingContainer) {
            loadingContainer = document.querySelector('#loadingScreen');
        }
        
        if (!loadingContainer) {
            this.log('LoadingTips: No loading container found, creating one');
            loadingContainer = document.createElement('div');
            loadingContainer.className = 'loading-container';
            document.body.appendChild(loadingContainer);
        }
        
        // Add tips section if it doesn't exist
        let tipsSection = loadingContainer.querySelector('.loading-tips-section');
        if (!tipsSection) {
            tipsSection = document.createElement('div');
            tipsSection.className = 'loading-tips-section';
            // Tip only: the overlay (loadingManager.js) owns the one status
            // line and the one progress bar (there were two of each, plus two spinners).
            tipsSection.innerHTML = `
                <div class="loading-tip-container">
                    <div class="loading-tip-icon">💡</div>
                    <div class="loading-tip-text" id="loadingTipText">Welcome to Adventure Stories!</div>
                </div>
            `;
            loadingContainer.appendChild(tipsSection);
        }
        
        // Store references to elements
        this.tipElement = document.getElementById('loadingTipText');
        this.progressElement = document.getElementById('loadingStatus');
        this.progressFill = document.getElementById('loadingProgressBar');
        
        // Add CSS styles
        this.addLoadingStyles();
        
        this.log('LoadingTips: Tips display initialized');
    }
    
    /**
     * Add CSS styles for the loading tips
     */
    addLoadingStyles() {
        const styleId = 'loading-tips-styles';
        if (document.getElementById(styleId)) return;
        
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .loading-tips-section {
                text-align: center;
                padding: 20px;
                max-width: 600px;
                margin: 0 auto;
            }
            
            .loading-tip-container {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                padding: 20px;
                margin: 20px 0;
                display: flex;
                align-items: center;
                gap: 15px;
                min-height: 60px;
                backdrop-filter: blur(5px);
                border: 1px solid rgba(255, 255, 255, 0.2);
            }
            
            .loading-tip-icon {
                font-size: 24px;
                flex-shrink: 0;
                animation: tipPulse 2s ease-in-out infinite;
            }
            
            @keyframes tipPulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.1); }
            }
            
            .loading-tip-text {
                color: #fff;
                font-size: 16px;
                line-height: 1.4;
                text-align: left;
                opacity: 0;
                animation: tipFadeIn 0.5s ease-in-out forwards;
            }
            
            @keyframes tipFadeIn {
                0% { opacity: 0; transform: translateY(10px); }
                100% { opacity: 1; transform: translateY(0); }
            }
            
        `;
        document.head.appendChild(style);
    }
    
    /**
     * Start rotating tips during loading
     */
    startTipRotation() {
        this.initializeTipsDisplay();
        
        // Show first tip immediately
        this.showNextTip();
        
        // Start rotation interval
        this.tipInterval = setInterval(() => {
            this.showNextTip();
        }, this.tipRotationTime);
        
        this.log('LoadingTips: Tip rotation started');
    }
    
    /**
     * Stop rotating tips
     */
    stopTipRotation() {
        if (this.tipInterval) {
            clearInterval(this.tipInterval);
            this.tipInterval = null;
        }
        this.log('LoadingTips: Tip rotation stopped');
    }
    
    /**
     * Show the next tip in rotation
     */
    showNextTip() {
        if (!this.tipElement) return;
        
        const tip = this.allTips[this.currentTipIndex];
        
        // Fade out current tip
        this.tipElement.style.animation = 'none';
        this.tipElement.style.opacity = '0';
        
        // Change tip after short delay
        setTimeout(() => {
            this.tipElement.textContent = tip;
            this.tipElement.style.animation = 'tipFadeIn 0.5s ease-in-out forwards';
        }, 200);
        
        // Move to next tip
        this.currentTipIndex = (this.currentTipIndex + 1) % this.allTips.length;
        
        // If we've gone through all tips, shuffle again for variety
        if (this.currentTipIndex === 0) {
            this.shuffleTips();
        }
    }
    
    /**
     * Update progress bar and text
     */
    updateProgress(percentage, statusText) {
        if (this.progressFill) {
            this.progressFill.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
        }
        
        if (this.progressElement && statusText) {
            this.progressElement.textContent = statusText;
        }
    }
    
    /**
     * Show a specific tip category during relevant initialization phases
     */
    showCategoryTip(category) {
        if (!this.tips[category] || !this.tipElement) return;
        
        const categoryTips = this.tips[category];
        const randomTip = categoryTips[Math.floor(Math.random() * categoryTips.length)];
        
        // Show the category-specific tip
        this.tipElement.style.animation = 'none';
        this.tipElement.style.opacity = '0';
        
        setTimeout(() => {
            this.tipElement.textContent = randomTip;
            this.tipElement.style.animation = 'tipFadeIn 0.5s ease-in-out forwards';
        }, 200);
        
        this.log(`LoadingTips: Showing ${category} tip: ${randomTip}`);
    }
    
    /**
     * Show completion message
     */
    showCompletion() {
        this.stopTipRotation();
        
        if (this.tipElement) {
            this.tipElement.style.animation = 'none';
            this.tipElement.style.opacity = '0';
            
            setTimeout(() => {
                this.tipElement.textContent = "🎉 Adventure ready! Your story awaits...";
                this.tipElement.style.animation = 'tipFadeIn 0.5s ease-in-out forwards';
            }, 200);
        }
        
        if (this.progressFill) {
            this.progressFill.style.width = '100%';
        }
        
        if (this.progressElement) {
            this.progressElement.textContent = 'Adventure ready!';
        }
    }
}

// Create and export global instance
export const loadingTips = new LoadingTipsManager();
