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
        this.tips = {
            combat: [
                "Combat Tip: Your attack and defense stats come from your base stats plus equipped items!",
                "Combat Tip: Some enemies are weak to specific spell schools - experiment with different magic types!",
                "Combat Tip: Running from combat isn't always cowardly - sometimes it's the smartest strategy!",
                "Combat Tip: Your age affects your starting stats - older characters have more experience!",
                "Combat Tip: Status effects can turn the tide of battle - use them wisely!",
                "Combat Tip: Special moves consume MP but can deal devastating damage or provide unique effects!",
                "Combat Tip: Watch enemy health and behavior - some get more dangerous when wounded!",
                "Combat Tip: Positioning matters! Some spells and abilities have range limitations!",
                "Combat Tip: Don't forget to use consumable items - they can save your life in tough fights!"
            ],
            
            spells: [
                "Magic Tip: Each spell school (Elemental, Arcane, Divine, etc.) has unique strengths and weaknesses!",
                "Magic Tip: Your spellcasting level determines what tier of spells you can learn and cast!",
                "Magic Tip: Spell slots limit how many spells you can cast - manage them carefully!",
                "Magic Tip: Some spells require material components - make sure you're prepared!",
                "Magic Tip: Ritual spells take longer to cast but are more powerful than normal spells!",
                "Magic Tip: Your favorite spell schools get bonuses - specialization pays off!"
            ],
            
            reputation: [
                "Reputation Tip: Your choices affect how NPCs react to you - be mindful of consequences!",
                "Reputation Tip: Bad reputation makes healing more expensive and enemies stronger!",
                "Reputation Tip: Good reputation opens up special dialogue options and better prices!",
                "Reputation Tip: Some factions may conflict with others - choose your allies wisely!",
                "Reputation Tip: Your reputation affects random encounters - heroes get help, villains get trouble!",
                "Reputation Tip: Lying and stealing will catch up with you - trust is hard to rebuild!",
                "Reputation Tip: Being honest might be harder in the short term, but pays off in the long run!",
                "Reputation Tip: Help people when you can - you never know when you'll need their help!",
                "Reputation Tip: Your party members' actions also affect how people see your group!"
            ],
            
            items: [
                "Item Tip: Equipment with higher tiers provides better bonuses but costs more!",
                "Item Tip: Some items have special effects beyond just stat bonuses!",
                "Item Tip: Consumable items can save your life - don't hoard them for 'the right moment'!",
                "Item Tip: Shop inventory changes as you progress - check back regularly for new gear!",
                "Item Tip: Your adventure theme affects what types of items you'll find!",
                "Item Tip: Some rare items can only be found through specific story choices!"
            ],
            
            exploration: [
                "World Tip: Different locations have different danger levels - prepare accordingly!",
                "World Tip: Your adventure theme shapes the entire world around you!",
                "World Tip: Some locations are only accessible through specific story paths!",
                "World Tip: Environmental effects can help or hinder you in combat!",
                "World Tip: Pay attention to location descriptions - they often contain important clues!",
                "World Tip: The time of day and weather can affect encounters and story options!"
            ],
            
            story: [
                "Story Tip: Every choice matters - the AI remembers your decisions throughout the adventure!",
                "Story Tip: There's no single 'correct' path - embrace the consequences of your choices!",
                "Story Tip: Your character's age and background influence available dialogue options!",
                "Story Tip: The story adapts to your playstyle - aggressive players face different challenges!",
                "Story Tip: Side quests often provide valuable rewards and character development!",
                "Story Tip: Your adventure goal can evolve based on your choices and discoveries!",
                "Story Tip: Pay attention to NPC names and details - they might become important later!",
                "Story Tip: Bold choices often lead to more interesting story developments!",
                "Story Tip: Sometimes the 'safe' choice isn't the most rewarding one!",
                "Story Tip: Your reputation affects what story options are available to you!"
            ],
            
            multiplayer: [
                "Party Tip: In multiplayer, coordinate your spell schools to cover all magical bases!",
                "Party Tip: Different party members can have different reputations with the same faction!",
                "Party Tip: Party members can help each other in combat - teamwork is powerful!",
                "Party Tip: Each party member's choices contribute to the overall story direction!",
                "Party Tip: Age diversity in your party provides different perspective options!",
                "Party Tip: Party members can share items and resources - cooperation is key!",
                "Party Tip: Discuss major decisions with your party - different perspectives lead to better outcomes!",
                "Party Tip: Assign roles in your party - who's the leader, the diplomat, the fighter?",
                "Party Tip: Support each other's character development and story arcs!"
            ],

            gameplay: [
                "Gameplay Tip: Read all your options carefully - each choice leads to different outcomes!",
                "Gameplay Tip: Don't be afraid to take risks - the most interesting stories come from bold choices!",
                "Gameplay Tip: Manage your resources carefully - health, MP, and items are all limited!",
                "Gameplay Tip: Explore different dialogue options - your character's personality matters!",
                "Gameplay Tip: Keep track of important NPCs and locations - they might become relevant later!",
                "Gameplay Tip: Your adventure theme shapes everything - embrace the world you've chosen!",
                "Gameplay Tip: Sometimes retreating and regrouping is smarter than fighting to the end!",
                "Gameplay Tip: Pay attention to the consequences of your actions - they build your story!",
                "Gameplay Tip: Experiment with different approaches - there's no single 'right' way to play!"
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
            tipsSection.innerHTML = `
                <div class="loading-progress-container">
                    <div class="loading-progress-bar">
                        <div class="loading-progress-fill" id="loadingProgressFill"></div>
                    </div>
                    <div class="loading-progress-text" id="loadingProgressText">Initializing...</div>
                </div>
                <div class="loading-tip-container">
                    <div class="loading-tip-icon">💡</div>
                    <div class="loading-tip-text" id="loadingTipText">Welcome to Adventure Stories!</div>
                </div>
                <div class="loading-animation">
                    <div class="loading-spinner"></div>
                    <div class="loading-dots">
                        <span>.</span><span>.</span><span>.</span>
                    </div>
                </div>
            `;
            loadingContainer.appendChild(tipsSection);
        }
        
        // Store references to elements
        this.tipElement = document.getElementById('loadingTipText');
        this.progressElement = document.getElementById('loadingProgressText');
        this.progressFill = document.getElementById('loadingProgressFill');
        
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
            
            .loading-progress-container {
                margin-bottom: 30px;
            }
            
            .loading-progress-bar {
                width: 100%;
                height: 8px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 4px;
                overflow: hidden;
                margin-bottom: 10px;
            }
            
            .loading-progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #4CAF50, #8BC34A, #CDDC39);
                width: 0%;
                transition: width 0.5s ease;
                border-radius: 4px;
                animation: progressGlow 2s ease-in-out infinite alternate;
            }
            
            @keyframes progressGlow {
                0% { box-shadow: 0 0 5px rgba(76, 175, 80, 0.5); }
                100% { box-shadow: 0 0 20px rgba(76, 175, 80, 0.8); }
            }
            
            .loading-progress-text {
                color: #fff;
                font-size: 14px;
                opacity: 0.8;
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
            
            .loading-animation {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 20px;
                margin-top: 20px;
            }
            
            .loading-spinner {
                width: 40px;
                height: 40px;
                border: 3px solid rgba(255, 255, 255, 0.3);
                border-top: 3px solid #fff;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            .loading-dots {
                display: flex;
                gap: 5px;
            }
            
            .loading-dots span {
                color: #fff;
                font-size: 24px;
                animation: dotBounce 1.4s ease-in-out infinite;
            }
            
            .loading-dots span:nth-child(1) { animation-delay: -0.32s; }
            .loading-dots span:nth-child(2) { animation-delay: -0.16s; }
            .loading-dots span:nth-child(3) { animation-delay: 0s; }
            
            @keyframes dotBounce {
                0%, 80%, 100% { 
                    transform: scale(0);
                    opacity: 0.5;
                }
                40% { 
                    transform: scale(1);
                    opacity: 1;
                }
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
