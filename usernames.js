const PREFIXES = [
  'Pro','xX','OG','Real','Top','Best','Dark','Cool','Big',
  'Fast','Wild','Free','Ice','Fire','Night','Shadow',
  'Dragon','Wolf','Star','Storm','Thunder','Neo',
  'The','Mr','Lord','King','Boss','Ace','Max',
  'Zon','Zo','Zoni','Zonik',
]

const NAMES = [
  'Zonsik','Grief','Viper','Killer','Sniper','Ninja','PvP','Gamer','Player',
  'Builder','Miner','Crafter','Fighter','Hunter','Looter','Rusher','Clutch','Aim',
  'Domer','Bomber','Troller','Swag','Flex','Legend','Champ','Master',
  'Blaze','Phantom','Ghost','Skull','Soul','Rage','Fury','Venom','Toxic',
  'Cobra','Wolf','Bear','Lion','Tiger','Eagle','Hawk','Crow','Shark',
  'Red','Blue','Green','Black','White','Gold','Silver','Iron','Diamond','Emerald',
  'Fire','Ice','Storm','Thunder','Light','Dark','Shadow','Night','Star','Moon',
  'Head','Shot','Kill','Spawn','Loot','Drop','Chest','Sword','Bow',
  'Base','Clan','Team','Squad','Army','Force','Power','Speed',
  'Molly','Server','Lobby','Queue',
  'YouTube','Stream','Twitch','Content','Video','Clip','Play',
  'Nokia','Sony','Puma','Nike','Adidas','Reebok','Gucci','Versace',
  'Kot','Pes','Medved','Volk','Lis','Zayats','Orel','Sokol',
  'Molot','Kamen','Oгон','Voda','Veter','Zemlya','Nebo',
]

const SUFFIXES = [
  '','1','12','13','42','69','99','100','123','420',
  '666','777','888','999','1337','228',
  'YT','XD','GG','WP','EZ','AFK','PVP','OP','MVP',
  'TTV','Live','Play','Craft','Build','Mine',
]

const RUSSIAN_NAMES = [
  'Андрей','Дмитрий','Максим','Сергей','Александр','Алексей','Артём','Илья','Кирилл','Михаил',
  'Никита','Матвей','Роман','Егор','Арсений','Иван','Денис','Евгений','Тимофей','Владислав',
  'Пётр','Тарас','Даниил','Данил','Павел','Семён','Богдан','Владимир','Савелий','Лев',
  'Константин','Фёдор','Демид','Архип','Святослав','Мирослав','Ярослав','Всеволод','Степан','Глеб',
]

const RUSSIAN_LAST = [
  'Иванов','Петров','Сидоров','Козлов','Морозов','Волков','Новиков','Морозов','Попов','Соколов',
  'Лебедев','Кузнецов','Ильин','Савельев','Зайцев','Павлов','Семёнов','Голубев','Виноградов',
]

function generateUsername() {
  const name = NAMES[Math.floor(Math.random() * NAMES.length)]
  const suffix = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)]
  const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)]

  const formats = [
    `${prefix}${name}${suffix}`,
    `${name}${suffix}`,
    `${name}${Math.floor(Math.random() * 9999)}`,
    `${name}${suffix}${Math.floor(Math.random() * 99)}`,
    `${NAMES[Math.floor(Math.random() * NAMES.length)]}${NAMES[Math.floor(Math.random() * NAMES.length)]}${Math.floor(Math.random() * 999)}`,
    `${prefix}${Math.floor(Math.random() * 9999)}`,
    `${prefix}${name}${Math.floor(Math.random() * 99)}`,
    `${name}${SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)]}${Math.floor(Math.random() * 99)}`,
    `${NAMES[Math.floor(Math.random() * NAMES.length)]}${Math.floor(Math.random() * 9999)}`,
    `${prefix}${NAMES[Math.floor(Math.random() * NAMES.length)]}${SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)]}`,
  ]

  return formats[Math.floor(Math.random() * formats.length)]
}

module.exports = { generateUsername }
