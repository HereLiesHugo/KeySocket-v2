// Mobile Navigation Toggle
document.addEventListener('DOMContentLoaded', function() {
    const mobileMenu = document.getElementById('mobile-menu');
    const navMenu = document.querySelector('.nav-menu');

    // Mobile menu toggle (only if element exists)
    if (mobileMenu) {
        mobileMenu.addEventListener('click', function() {
            mobileMenu.classList.toggle('active');
            navMenu.classList.toggle('active');
        });
    }

    // Close mobile menu when clicking on a link
    document.querySelectorAll('.nav-menu a').forEach(link => {
        link.addEventListener('click', function() {
            if (mobileMenu) {
                mobileMenu.classList.remove('active');
            }
            navMenu.classList.remove('active');
        });
    });

    // Enhanced smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const target = document.querySelector(targetId);
            
            if (target) {
                // Close mobile menu if open
                if (mobileMenu) {
                    mobileMenu.classList.remove('active');
                }
                navMenu.classList.remove('active');
                
                // Calculate offset with navbar height
                const navbar = document.querySelector('.navbar');
                const navbarHeight = navbar ? navbar.offsetHeight : 70;
                const targetPosition = target.offsetTop - navbarHeight - 20; // Extra 20px padding
                
                // Smooth scroll with fallback for browsers that don't support smooth behavior
                if ('scrollBehavior' in document.documentElement.style) {
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                } else {
                    // Fallback for older browsers
                    const startPosition = window.pageYOffset;
                    const distance = targetPosition - startPosition;
                    const duration = 800;
                    let start = null;
                    
                    function animation(currentTime) {
                        if (start === null) start = currentTime;
                        const timeElapsed = currentTime - start;
                        const run = ease(timeElapsed, startPosition, distance, duration);
                        window.scrollTo(0, run);
                        if (timeElapsed < duration) requestAnimationFrame(animation);
                    }
                    
                    function ease(t, b, c, d) {
                        t /= d / 2;
                        if (t < 1) return c / 2 * t * t + b;
                        t--;
                        return -c / 2 * (t * (t - 2) - 1) + b;
                    }
                    
                    requestAnimationFrame(animation);
                }
                
                // Update active nav state
                updateActiveNavLink(targetId);
            }
        });
    });
    
    // Update active navigation link based on scroll position
    function updateActiveNavLink(targetId) {
        document.querySelectorAll('.nav-menu a').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === targetId) {
                link.classList.add('active');
            }
        });
    }
    
    // Scroll spy - update active nav link on scroll
    window.addEventListener('scroll', debounce(function() {
        const sections = document.querySelectorAll('section[id]');
        const navbarHeight = document.querySelector('.navbar')?.offsetHeight || 70;
        const scrollPosition = window.pageYOffset + navbarHeight + 100;
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            const sectionId = section.getAttribute('id');
            
            if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                updateActiveNavLink(`#${sectionId}`);
            }
        });
    }, 100));

    // Navbar scroll effect
    let lastScrollTop = 0;
    const navbar = document.querySelector('.navbar');
    
    window.addEventListener('scroll', function() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        if (scrollTop > 100) {
            // Use dark theme background for KeySocket
            navbar.style.background = 'rgba(15, 23, 42, 0.98)';
            navbar.style.boxShadow = '0 2px 20px rgba(0, 0, 0, 0.1)';
        } else {
            // Use dark theme background for KeySocket
            navbar.style.background = 'rgba(15, 23, 42, 0.95)';
            navbar.style.boxShadow = 'none';
        }
        
        lastScrollTop = scrollTop;
    });

    // Initialize terminal demo
    initializeTerminal();
    
    // Initialize terminal typing animation
    initializeTerminalTypingAnimation();
    
    // Initialize contact form
    initializeContactForm();
    
    // Add scroll animations
    initializeScrollAnimations();
    
    // Update copyright year
    updateCopyrightYear();
});

// Terminal Demo Functionality
function initializeTerminal() {
    const terminalElement = document.getElementById('terminal');
    const connectBtn = document.getElementById('connect-btn');
    const clearBtn = document.getElementById('clear-btn');
    
    if (!terminalElement) return;
    
    let terminalLines = [];
    let isConnected = false;
    
    // Initial terminal welcome message
    const welcomeMessage = [
        '╔══════════════════════════════════════════════════════════════╗',
        '║                    KeySocket Terminal                        ║',
        '║              Secure Web-based SSH Gateway                     ║',
        '╚══════════════════════════════════════════════════════════════╝',
        '',
        'Welcome to KeySocket Terminal Demo',
        'Click "Connect to SSH" to simulate a connection',
        'Type "help" for available commands',
        '',
        '$ '
    ];
    
    terminalLines = [...welcomeMessage];
    renderTerminal();
    
    // Terminal input handling
    let currentInput = '';
    let history = [];
    let historyIndex = -1;
    
    terminalElement.addEventListener('click', function() {
        if (isConnected) {
            terminalElement.focus();
        }
    });
    
    terminalElement.addEventListener('keydown', function(e) {
        if (!isConnected) return;
        
        const key = e.key;
        
        if (key === 'Enter') {
            if (currentInput.trim()) {
                history.push(currentInput);
                historyIndex = history.length;
                processCommand(currentInput);
                currentInput = '';
            }
        } else if (key === 'Backspace') {
            currentInput = currentInput.slice(0, -1);
            updateTerminalInput();
        } else if (key === 'ArrowUp') {
            e.preventDefault();
            if (historyIndex > 0) {
                historyIndex--;
                currentInput = history[historyIndex];
                updateTerminalInput();
            }
        } else if (key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex < history.length - 1) {
                historyIndex++;
                currentInput = history[historyIndex];
                updateTerminalInput();
            } else {
                historyIndex = history.length;
                currentInput = '';
                updateTerminalInput();
            }
        } else if (key.length === 1 && !e.ctrlKey && !e.metaKey) {
            currentInput += key;
            updateTerminalInput();
        }
        
        e.preventDefault();
    });
    
    function processCommand(command) {
        const cmd = command.trim().toLowerCase();
        terminalLines.push(`$ ${command}`);
        
        switch (cmd) {
            case 'help':
                terminalLines.push(
                    'Available commands:',
                    '  help     - Show this help message',
                    '  clear    - Clear terminal',
                    '  status   - Show connection status',
                    '  ls       - List files (demo)',
                    '  whoami   - Show current user',
                    '  date     - Show current date',
                    '  exit     - Disconnect from terminal'
                );
                break;
                
            case 'clear':
                terminalLines = [];
                break;
                
            case 'status':
                terminalLines.push(
                    'Connection Status: Connected',
                    'Server: demo.keysocket.io',
                    'User: keysocket_user',
                    'Uptime: 2 hours, 15 minutes'
                );
                break;
                
            case 'ls':
                terminalLines.push(
                    'drwxr-xr-x  2 user user 4096 Dec 10 10:30 documents',
                    'drwxr-xr-x  3 user user 4096 Dec 10 09:15 projects',
                    'drwxr-xr-x  2 user user 4096 Dec 10 08:00 downloads',
                    '-rw-r--r--  1 user user  234 Dec 10 10:45 readme.txt',
                    '-rwxr-xr-x  1 user user  856 Dec 10 10:30 script.sh'
                );
                break;
                
            case 'whoami':
                terminalLines.push('keysocket_user');
                break;
                
            case 'date':
                terminalLines.push(new Date().toString());
                break;
                
            case 'exit':
                disconnectTerminal();
                return;
                
            default:
                if (cmd) {
                    terminalLines.push(`Command not found: ${command}. Type 'help' for available commands.`);
                }
        }
        
        terminalLines.push('$ ');
        renderTerminal();
        scrollToBottom();
    }
    
    function updateTerminalInput() {
        const lines = terminalLines.slice(0, -1);
        lines.push(`$ ${currentInput}`);
        terminalElement.textContent = lines.join('\n');
        scrollToBottom();
    }
    
    function renderTerminal() {
        terminalElement.textContent = terminalLines.join('\n');
    }
    
    function scrollToBottom() {
        terminalElement.scrollTop = terminalElement.scrollHeight;
    }
    
    // Connect button functionality
    connectBtn.addEventListener('click', function() {
        if (!isConnected) {
            connectTerminal();
        } else {
            disconnectTerminal();
        }
    });
    
    function connectTerminal() {
        isConnected = true;
        connectBtn.textContent = 'Disconnect';
        connectBtn.classList.remove('btn-primary');
        connectBtn.classList.add('btn-secondary');
        
        // Simulate connection process
        terminalLines.push('Connecting to demo.keysocket.io...');
        renderTerminal();
        scrollToBottom();
        
        setTimeout(() => {
            terminalLines.push('Establishing secure connection...');
            renderTerminal();
            scrollToBottom();
        }, 1000);
        
        setTimeout(() => {
            terminalLines.push('Authentication successful');
            terminalLines.push('Connected to KeySocket Terminal');
            terminalLines.push('$ ');
            renderTerminal();
            scrollToBottom();
            terminalElement.focus();
        }, 2000);
    }
    
    function disconnectTerminal() {
        isConnected = false;
        connectBtn.textContent = 'Connect to SSH';
        connectBtn.classList.remove('btn-secondary');
        connectBtn.classList.add('btn-primary');
        
        terminalLines.push('Disconnecting...');
        terminalLines.push('Connection closed.');
        terminalLines.push('');
        terminalLines.push('Click "Connect to SSH" to reconnect');
        renderTerminal();
        scrollToBottom();
    }
    
    // Clear button functionality
    clearBtn.addEventListener('click', function() {
        if (isConnected) {
            terminalLines = ['$ '];
        } else {
            terminalLines = [...welcomeMessage];
        }
        renderTerminal();
        scrollToBottom();
    });
}

// Contact Form Functionality
function initializeContactForm() {
    const contactForm = document.getElementById('contact-form');
    
    if (!contactForm) return;
    
    contactForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Get form data
        const formData = new FormData(contactForm);
        const name = contactForm.querySelector('input[type="text"]').value;
        const email = contactForm.querySelector('input[type="email"]').value;
        const message = contactForm.querySelector('textarea').value;
        
        // Basic validation
        if (!name || !email || !message) {
            showNotification('Please fill in all fields', 'error');
            return;
        }
        
        if (!isValidEmail(email)) {
            showNotification('Please enter a valid email address', 'error');
            return;
        }
        
        // Simulate form submission
        const submitBtn = contactForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        
        submitBtn.textContent = 'Sending...';
        submitBtn.disabled = true;
        
        setTimeout(() => {
            showNotification('Message sent successfully! We\'ll get back to you soon.', 'success');
            contactForm.reset();
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }, 2000);
    });
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Notification System
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Add styles
    Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '15px 20px',
        borderRadius: '8px',
        color: 'white',
        fontWeight: '500',
        zIndex: '10000',
        transform: 'translateX(100%)',
        transition: 'transform 0.3s ease',
        maxWidth: '300px',
        wordWrap: 'break-word'
    });
    
    // Set background color based on type
    switch (type) {
        case 'success':
            notification.style.background = '#22c55e';
            break;
        case 'error':
            notification.style.background = '#ef4444';
            break;
        case 'warning':
            notification.style.background = '#f59e0b';
            break;
        default:
            notification.style.background = '#2563eb';
    }
    
    // Add to page
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Remove after 5 seconds
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

// Scroll Animations
function initializeScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    // Observe elements for animation
    const animatedElements = document.querySelectorAll('.feature-card, .step, .security-item');
    
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
}

// Feature Cards Hover Effect
document.addEventListener('DOMContentLoaded', function() {
    const featureCards = document.querySelectorAll('.feature-card');
    
    featureCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-10px) scale(1.02)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(-5px) scale(1)';
        });
    });
});

// Terminal Typing Animation for Hero Section
function initializeTerminalTypingAnimation() {
    const command = document.querySelector('.command');
    
    if (!command) return;
    
    // Add typing class to trigger CSS animation after page load
    setTimeout(() => {
        command.classList.add('typing');
    }, 1000);
}

// Performance optimization - Debounce scroll events
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Apply debounce to scroll events
window.addEventListener('scroll', debounce(function() {
    // Add any scroll-based performance optimizations here
}, 100));

// Add loading state for buttons
document.addEventListener('DOMContentLoaded', function() {
    const buttons = document.querySelectorAll('.btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            if (!this.classList.contains('loading')) {
                this.classList.add('loading');
                setTimeout(() => {
                    this.classList.remove('loading');
                }, 1000);
            }
        });
    });
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + K for quick search (placeholder functionality)
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        showNotification('Quick search feature coming soon!', 'info');
    }
    
    // Escape to close mobile menu
    if (e.key === 'Escape') {
        const mobileMenu = document.getElementById('mobile-menu');
        const navMenu = document.querySelector('.nav-menu');
        
        if (mobileMenu.classList.contains('active')) {
            mobileMenu.classList.remove('active');
            navMenu.classList.remove('active');
        }
    }
});

// Export functions for potential use by other scripts
window.KeySocketLanding = {
    showNotification,
    initializeTerminal,
    initializeTerminalTypingAnimation,
    initializeContactForm,
    initializeScrollAnimations
};

// Copyright Year Update Function
function updateCopyrightYear() {
    const currentYearElement = document.getElementById('current-year');
    if (currentYearElement) {
        currentYearElement.textContent = new Date().getFullYear();
    }
}