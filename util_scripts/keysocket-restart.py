#!/usr/bin/env python3
from subprocess import call

call('echo Reloading PM2', shell=True)
call('/usr/local/bin/pm2 reload 0 keysocket', shell=True)
call('/usr/local/bin/pm2 status', shell=True)
call('sudo nginx -t', shell=True)
call('echo Restarting Nginx', shell=True)
call('sleep 2s', shell=True)
call('sudo systemctl restart nginx', shell=True)