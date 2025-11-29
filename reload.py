from subprocess import call, check_call, CalledProcessError
from time import sleep

# Helper function to print bold text (optional, makes logs easier to read)
def log(message):
    print(f"\n--- {message} ---")

try:
    log('Fetching all updates...')
    # check_call will STOP the script if git fetch fails
    check_call('git fetch --all', shell=True)
    
    log('Pulling latest changes...')
    check_call('git pull', shell=True)
    sleep(1)

    log('Installing backend dependencies...')
    check_call('npm install', shell=True)
    sleep(1)

    log('Auditing dependencies...')
    # We use 'call' here because npm audit returns an error code if vulnerabilities are found.
    # We don't want to stop the deployment just because of a warning, so we don't use check_call.
    call('npm audit', shell=True)
    
    log('Reloading backend through pm2...')
    # Using your updated specific app name
    check_call('pm2 reload keysocket --update-env', shell=True)
    sleep(1)

    log('Reloading nginx...')
    check_call('sudo systemctl reload nginx', shell=True)
    sleep(1)

    log('Checking nginx status...')
    # Added --no-pager so the script doesn't freeze
    call('sudo systemctl status nginx --no-pager', shell=True)

    log('Checking pm2 status...')
    call('pm2 status keysocket', shell=True)

    log('Update and reload complete!')

except CalledProcessError:
    print("\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
    print("ERROR: One of the commands failed. Deployment stopped.")
    print("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")