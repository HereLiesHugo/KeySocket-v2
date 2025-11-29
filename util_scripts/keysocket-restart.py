#!/usr/bin/env python3
import os
from subprocess import call

# Get PM2 path
pm2_path = os.popen('which pm2').read().strip()

call(f'echo Reloading PM2', shell=True)
call(f'{pm2_path} reload 0 keysocket', shell=True)
call(f'{pm2_path} status', shell=True)
call('sudo nginx -t', shell=True)
call('echo Restarting Nginx', shell=True)
call('sleep 2s', shell=True)
call('sudo systemctl restart nginx', shell=True)