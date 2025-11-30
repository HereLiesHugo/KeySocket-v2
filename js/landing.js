// Mobile Navigation Toggle
document.addEventListener('DOMContentLoaded', function() {
    const mobileMenu = document.getElementById('mobile-menu');
    const navMenu = document.querySelector('.nav-menu');
    const darkModeToggle = document.getElementById('dark-mode-toggle');

    // Initialize dark mode
    initializeDarkMode();

    // Mobile menu toggle
    mobileMenu.addEventListener('click', function() {
        mobileMenu.classList.toggle('active');
        navMenu.classList.toggle('active');
    });

    // Dark mode toggle
    darkModeToggle.addEventListener('click', function() {
        toggleDarkMode();
    });

    // Close mobile menu when clicking on a link
    document.querySelectorAll('.nav-menu a').forEach(link => {
        link.addEventListener('click', function() {
            mobileMenu.classList.remove('active');
            navMenu.classList.remove('active');
        });
    });

    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const offset = 80; // Account for fixed navbar
                const targetPosition = target.offsetTop - offset;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Navbar scroll effect
    let lastScrollTop = 0;
    const navbar = document.querySelector('.navbar');
    
    window.addEventListener('scroll', function() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        if (scrollTop > 100) {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            navbar.style.background = isDark ? 'rgba(15, 23, 42, 0.98)' : 'rgba(255, 255, 255, 0.98)';
            navbar.style.boxShadow = '0 2px 20px rgba(0, 0, 0, 0.1)';
        } else {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            navbar.style.background = isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';
            navbar.style.boxShadow = 'none';
        }
        
        lastScrollTop = scrollTop;
    });

    // Initialize terminal demo
    initializeTerminal();
    
    // Initialize contact form
    initializeContactForm();
    
    // Add scroll animations
    initializeScrollAnimations();
    
    // Update copyright year
    updateCopyrightYear();
});

// Dark Mode Functionality
function initializeDarkMode() {
    // Check for saved theme preference or default to light mode
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (systemPrefersDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
    }

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('theme')) {
            document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        }
    });
}

function toggleDarkMode() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Update navbar background immediately
    const navbar = document.querySelector('.navbar');
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    if (scrollTop > 100) {
        navbar.style.background = newTheme === 'dark' ? 'rgba(15, 23, 42, 0.98)' : 'rgba(255, 255, 255, 0.98)';
    } else {
        navbar.style.background = newTheme === 'dark' ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    }
    
    // Add transition effect
    document.body.style.transition = 'background-color 0.3s ease, color 0.3s ease';
    
    // Show notification
    showNotification(`${newTheme === 'dark' ? 'Dark' : 'Light'} mode activated`, 'info');
}

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

// Typing Animation for Hero Terminal
document.addEventListener('DOMContentLoaded', function() {
    const typingElements = document.querySelectorAll('.typing');
    
    typingElements.forEach(element => {
        const text = element.textContent;
        element.textContent = '';
        let index = 0;
        
        function type() {
            if (index < text.length) {
                element.textContent += text.charAt(index);
                index++;
                setTimeout(type, 100);
            } else {
                setTimeout(() => {
                    element.textContent = '';
                    index = 0;
                    type();
                }, 2000);
            }
        }
        
        type();
    });
});

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