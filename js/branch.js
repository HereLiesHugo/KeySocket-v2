/**
 * Branch detection utility for KeySocket
 * Dynamically updates GitHub links to reflect the current active branch
 */

class BranchDetector {
    githubUrl = 'https://github.com/HereLiesHugo/KeySocket-v2';
    branchCache = null;
    cacheExpiry = 5 * 60 * 1000; // 5 minutes

    /**
     * Get the current branch from the server
     */
    async getCurrentBranch() {
        // Check cache first
        if (this.branchCache?.timestamp && (Date.now() - this.branchCache.timestamp < this.cacheExpiry)) {
            return this.branchCache.branch;
        }

        try {
            // Try to get branch from server API endpoint
            const response = await fetch('/api/branch');
            if (response.ok) {
                const data = await response.json();
                const branch = data.branch || 'main';
                this.updateCache(branch);
                return branch;
            }
        } catch (error) {
            console.warn('Could not fetch branch from API:', error);
        }

        try {
            // Fallback: try to get from git info endpoint if available
            const response = await fetch('/git-info');
            if (response.ok) {
                const data = await response.json();
                const branch = data.branch || data.current_branch || 'main';
                this.updateCache(branch);
                return branch;
            }
        } catch (error) {
            console.warn('Could not fetch git info:', error);
        }

        // Final fallback: assume main branch
        this.updateCache('main');
        return 'main';
    }

    /**
     * Update branch cache
     */
    updateCache(branch) {
        this.branchCache = {
            branch: branch,
            timestamp: Date.now()
        };
    }

    /**
     * Update GitHub link with current branch
     */
    async updateGitHubLink() {
        const branch = await this.getCurrentBranch();
        const githubLink = document.querySelector('a[href*="github.com/HereLiesHugo/KeySocket-v2"]');
        
        if (githubLink) {
            const newUrl = `${this.githubUrl}/tree/${branch}`;
            githubLink.href = newUrl;
            
            // Update text content based on branch
            if (branch === 'main' || branch === 'master') {
                githubLink.textContent = `GitHub "${branch} branch" - Stable production version`;
            } else if (branch === 'dev' || branch === 'develop') {
                githubLink.textContent = `GitHub "${branch} branch" - This is the experimental development branch and may contain bugs`;
            } else {
                githubLink.textContent = `GitHub "${branch} branch" - Current working branch (probably unstable, sorry for any potential inconvenience)`;
            }
        }
    }

    /**
     * Initialize branch detection
     */
    async init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.updateGitHubLink());
        } else {
            await this.updateGitHubLink();
        }
    }
}

// Initialize the branch detector
const branchDetector = new BranchDetector();
branchDetector.init();
