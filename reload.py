from subprocess import call, check_call, CalledProcessError
from time import sleep

def log(message):
    print(f"\n--- {message} ---")

try:

    # 1. GIT OPERATIONS
    log('Fetching/Pulling latest changes...')
    check_call('git fetch', shell=True)
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
    # We use 'call' so warnings don't stop the deployment
    call('npm audit', shell=True)
    print("Audited backend dependencies.")
    sleep(1)
    
    # 3. BACKEND RELOAD
    log('Reloading backend through pm2...')
    check_call('pm2 reload keysocket --update-env', shell=True)
    print("Reloaded backend through pm2.")
    sleep(1)
    
    log('Waiting for backend to stabilize (3s)...')
    sleep(3) # Give PM2 a moment to actually boot the process

    # 4. HEALTH CHECK (Crucial Step)
    log('Verifying backend is running...')
    # Added '-f': Fails silently (returns error code) on HTTP errors (404/500).
    # Added '--retry': Tries 3 times in case the app is slow to start.
    check_call('curl -f -I --retry 3 --retry-delay 1 http://localhost:3000', shell=True)
    print("Verified backend.")
    sleep(1)

    # 5. NGINX RELOAD (Safe Mode)
    log('Verifying nginx configuration...')
    # We check config BEFORE reloading. If this fails, we don't reload.
    check_call('sudo nginx -t', shell=True)
    print("Verified nginx configuration.")
    sleep(1)

    log('Reloading nginx...')
    check_call('sudo systemctl reload nginx', shell=True)
    print("Reloaded nginx.")
    sleep(1)

    # 6. STATUS REPORTS
    log('Checking nginx status...')
    call('sudo systemctl status nginx --no-pager', shell=True)
    print("Verified nginx status.")
    sleep(1)

    log('Checking pm2 status...')
    call('pm2 status keysocket', shell=True)
    print("Verified pm2 status.")
    sleep(1)

    log('Update and reload complete!')

except CalledProcessError:
    print("\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
    print("ERROR: One of the commands failed. Deployment stopped.")
    print("Check the logs above to see which step failed.")
    print("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
