// Ссылки .claude/skills/<name> → docs/skills/**/<скилл> (скилл skill-authoring).
import { lstatSync, mkdirSync, readdirSync, symlinkSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { readSkills, root } from './skills.ts'

// Сначала прочитать и проверить все скиллы — при ошибке старые ссылки остаются на месте.
const skills = readSkills()
const seen = new Set<string>()
for (const skill of skills) {
	if (!skill.name) throw new Error(`нет name: ${skill.file}`)
	if (seen.has(skill.name)) throw new Error(`дубль имени: ${skill.name}`)
	seen.add(skill.name)
}

const dest = join(root, '.claude/skills')
mkdirSync(dest, { recursive: true })
for (const entry of readdirSync(dest)) {
	if (lstatSync(join(dest, entry)).isSymbolicLink()) unlinkSync(join(dest, entry))
}
for (const skill of skills) {
	symlinkSync(join('../..', skill.dir), join(dest, skill.name))
	console.log(`${skill.name} -> ${skill.dir}`)
}
