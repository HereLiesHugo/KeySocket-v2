from subprocess import call, check_call, CalledProcessError
from time import sleep

# --- CONFIGURATION ---
PORT = 3000  # Change this if your app port changes in .env
APP_NAME = "keysocket" # Change this to your pm2 app name
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

    # 3. BACKEND RELOAD
    log(f'Reloading {APP_NAME} through pm2...')
    check_call(f'pm2 reload {APP_NAME} --update-env', shell=True)
    print("Reload command sent.")
    
    log('Waiting for backend to stabilize (1s)...')
    sleep(1) 

    log('Reloading nginx...')
    check_call('sudo systemctl reload nginx', shell=True)
    print("Nginx reloaded.")

    # 6. STATUS REPORTS
    log('Checking nginx status...')
    call('sudo systemctl status nginx --no-pager', shell=True)

    log(f'Checking pm2 status for {APP_NAME}...')
    call(f'pm2 status {APP_NAME}', shell=True)

    # 7. DONE

    log('Update and reload complete!')

except CalledProcessError:
    print("\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
    print("ERROR: One of the commands failed. Deployment stopped.")
    print("Check the logs above to see which step failed.")
    print("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")