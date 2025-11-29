from subprocess import call, check_call, CalledProcessError
from time import sleep

# --- CONFIGURATION ---
PORT = 3000  # Change this if your app port changes in .env
APP_NAME = "keysocket"
# ---------------------

def log(message):
    print(f"\n--- {message} ---")

try:
    # 1. GIT OPERATIONS
    log('Fetching/Pulling latest changes...')
    check_call('git fetch --all', shell=True)
    print("Fetched latest changes.")
    
    check_call('git pull', shell=True)
    print("Pulled latest changes.")
    sleep(1)

    # 2. DEPENDENCIES
    log('Installing backend dependencies...')
    check_call('npm install', shell=True)
    print("Installed backend dependencies.")
    sleep(1)

    log('Auditing dependencies...')
    # Using 'call' allows the script to continue even if vulnerabilities are found
    call('npm audit', shell=True)
    print("Audit check complete.")
    sleep(1)
    
    # 3. BACKEND RELOAD
    log(f'Reloading {APP_NAME} through pm2...')
    check_call(f'pm2 reload {APP_NAME} --update-env', shell=True)
    print("Reload command sent.")
    
    log('Waiting for backend to stabilize (3s)...')
    sleep(3) 

    # 4. HEALTH CHECK
    log(f'Verifying backend is running on port {PORT}...')
    # -f: Fails on HTTP errors (404/500)
    # --retry 3: Tries 3 times before giving up
    check_call(f'curl -f -I --retry 3 --retry-delay 1 http://localhost:{PORT}', shell=True)
    print("Backend health check passed.")
    sleep(1)

    # 5. NGINX RELOAD
    log('Verifying nginx configuration...')
    # Always test config before reloading!
    check_call('sudo nginx -t', shell=True)
    print("Nginx configuration valid.")
    sleep(1)

    log('Reloading nginx...')
    check_call('sudo systemctl reload nginx', shell=True)
    print("Nginx reloaded.")
    sleep(1)

    # 6. STATUS REPORTS
    log('Checking nginx status...')
    call('sudo systemctl status nginx --no-pager', shell=True)
    sleep(1)

    log(f'Checking pm2 status for {APP_NAME}...')
    call(f'pm2 status {APP_NAME}', shell=True)
    sleep(1)

    # 7. DONE

    log('Update and reload complete!')

except CalledProcessError:
    print("\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
    print("ERROR: One of the commands failed. Deployment stopped.")
    print("Check the logs above to see which step failed.")
    print("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")