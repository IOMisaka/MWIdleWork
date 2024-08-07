import os

with open("idlework.user.js","r+",encoding="utf-8") as file:
	lines=file.readlines()
	arr = lines[3].split(".")
	arr[-1]=str(int(arr[-1])+1)
	lines[3]=".".join(arr)+"\n"

	file.seek(0)
	file.writelines(lines)
	file.truncate()