from subprocess import call

call('echo Reloading PM2', shell=True)
call('pm2 reload 0 keysocket', shell=True)
call('pm2 status', shell=True)
call('sudo nginx -t', shell=True)
call('sudo systemctl restart nginx', shell=True)
call('sudo systemctl reload nginx', shell=True)

