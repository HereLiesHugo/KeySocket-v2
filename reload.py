from subprocess import call

call('git pull', shell=True)
call('npm audit', shell=True)
call('npm audit fix', shell=True)
call('pm2 reload 0', shell=True)
call('sudo systemctl reload nginx', shell=True)
