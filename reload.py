from subprocess import call

call('pm2 reload 0', shell=True)
call('sudo systemctl reload nginx', shell=True)
