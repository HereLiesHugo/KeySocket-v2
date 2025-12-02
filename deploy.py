from subprocess import call, check_call, CalledProcessError
from time import sleep

# --- CONFIGURATION ---
PORT = 3000  # Change this if your app port changes in .env
APP_NAME = "keysocket" # Change this to your pm2 app name
# ---------------------

def log(message, color=None):
    """Print a framed log message using the provided color (falls back to HEADER)."""
    c = color or bcolors.HEADER
    print(f"{c}\n--- {message} --- {bcolors.ENDC}")

# Source - https://stackoverflow.com/a
# Posted by joeld, modified by community. See post 'Timeline' for change history
# Retrieved 2025-12-02, License - CC BY-SA 4.0

class bcolors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

# End Stack overflow snippet

def color_text(msg, color):
    return f"{color}{msg}{bcolors.ENDC}"

def info(msg):
    print(color_text(msg, bcolors.OKBLUE))

def success(msg):
    print(color_text(msg, bcolors.OKGREEN))

def warn(msg):
    print(color_text(msg, bcolors.WARNING))

def error(msg):
    print(color_text(msg, bcolors.FAIL))


# Convenience log wrappers with semantic colors
def log_header(msg):
    log(msg, bcolors.HEADER)

def log_info(msg):
    log(msg, bcolors.OKBLUE)

def log_action(msg):
    log(msg, bcolors.OKCYAN)

def log_warn(msg):
    log(msg, bcolors.WARNING)

def log_error(msg):
    log(msg, bcolors.FAIL)

branch = check_call("git branch --show-current", shell=True)

try:
    # 1. GIT OPERATIONS
    log_info(f'You are currently on branch "{branch}"')
    log_action(f'Fetching/Pulling latest changes from {branch}...')
    check_call('git fetch --all', shell=True)
    success("Fetched latest changes.")
    
    check_call('git pull', shell=True)
    success("Pulled latest changes.")
    sleep(1)

    # 2. DEPENDENCIES
    log_action('Installing backend dependencies...')
    check_call('npm install', shell=True)
    success("Installed backend dependencies.")
    sleep(1)

    log_action('Auditing dependencies...')
    # Using 'call' allows the script to continue even if vulnerabilities are found
    call('npm audit', shell=True)
    info("Audit check complete.")
    sleep(1)
    
    # 3. BACKEND RELOAD
    log_action(f'Reloading {APP_NAME} through pm2...')
    check_call(f'pm2 reload {APP_NAME} --update-env', shell=True)
    success("Reload command sent.")
    
    log_info('Waiting for backend to stabilize (3s)...')
    sleep(3) 

    # 4. HEALTH CHECK
    log_action(f'Verifying backend is running on port {PORT}...')
    # -f: Fails on HTTP errors (404/500)
    # --retry 3: Tries 3 times before giving up
    check_call(f'curl -f -I --retry 3 --retry-delay 1 http://localhost:{PORT}', shell=True)
    success("Backend health check passed.")
    sleep(1)

    # 5. NGINX RELOAD
    log_action('Verifying nginx configuration...')
    # Always test config before reloading!
    check_call('sudo nginx -t', shell=True)
    success("Nginx configuration valid.")
    sleep(1)

    log_action('Reloading nginx...')
    check_call('sudo systemctl reload nginx', shell=True)
    success("Nginx reloaded.")
    sleep(1)

    # 6. STATUS REPORTS
    log_info('Checking nginx status...')
    call('sudo systemctl status nginx --no-pager', shell=True)
    sleep(1)

    log_info(f'Checking pm2 status for {APP_NAME}...')
    call(f'pm2 status {APP_NAME}', shell=True)
    sleep(1)

    # 7. DONE

    log_header('Update and reload complete!')
    success('Deployment script finished successfully.')
    sleep(1)

except CalledProcessError:
    error("\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
    error("ERROR: One of the commands failed. Deployment stopped.")
    error("Check the logs above to see which step failed.")
    error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")