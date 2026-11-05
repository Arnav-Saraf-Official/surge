\# FPS Game Implementation Plan: SURGE



\*Working title: \*\*\*\*SURGE\*\*\*\*. Fast, movement-heavy 3D first-person shooter where your loadout is your class.\*



\## 1. Core Pillars



1\. \*\*Loadout is identity.\*\* Seven slots, seven weapon types, two abilities per weapon. What you bring defines how you play.

2\. \*\*Movement is a weapon.\*\* Slide, double jump and dual grapples reward skill and feed the style meter.

3\. \*\*Specialize or diversify.\*\* Fewer weapons means stronger bonuses; more weapons means more tools.

4\. \*\*Synergy is the jackpot.\*\* Specific weapon pairs replace the OP ability with something game-warping.



\## 2. Controls and Movement



| Key | Action |

| --- | --- |

| W A S D | Move |

| Shift | Sprint |

| C | Crouch |

| Shift + C (while sprinting) | Slide |

| Space (twice) | Jump / double jump |

| Q / E | Left / right grappling hook |

| F | Primary ability (current weapon) |

| T | OP ability (current weapon) |

| G | Auto-arm explosive, use it, swap back |

| V | Auto-swap to blade, prepare or perform attack, swap back |

| 1 to 7, scroll | Select loadout slot |



\*\*Slide.\*\* Needs sprint speed. Carries momentum for about 1.2 s, lowers hitbox, allows full aiming and firing. Jumping out of a slide keeps the speed (slide-jump). Damage dealt during or within 1 s after a slide earns style points. Slide on slopes extends distance.



\*\*Double jump.\*\* One extra jump in the air, resettable by touching a grapple point or wall.



\*\*Grappling hooks.\*\* Independent left and right hooks. Range 30 m, 4 s cooldown per hook (reduced by the Grapple upgrade). Two modes: \*swing\* (hold, rope physics) and \*zip\* (tap, pulls you to the point). Hooks stick to surfaces and light-weight pull on enemies (you move toward them). Using both hooks at once allows a fast "spider swing". Hooks are cancelled by jumping.



\*\*G (explosive).\*\* Picks the preferred explosive (configurable if you carry several), uses it (grenade or molotov is thrown, mine is placed, RPG is fired), then returns to your previous weapon. Hold G to cycle explosive types.



\*\*V (blade).\*\* Swaps to your preferred blade and performs the bound action. Bind per blade: primary (stab/slash) or secondary (throw aim). Tap = default action, hold = alternate.



\## 3. Loadout Rules



\- \*\*7 slots.\*\* Fill with any weapons from any category. All 7 can be the same type; no duplicate weapons.

\- \*\*Menu.\*\* Each of the 7 types has at least 5 weapons (35 total at launch).

\- \*\*Empty slot buffs.\*\* Each empty slot grants the next buff in this rotating list, capped at 2 stacks of each:

&#x20; 1. +5 max health

&#x20; 2. +5% move speed

&#x20; 3. +5% reload and weapon swap speed

&#x20; 4. +5% cooldown reduction

&#x20; 5. +5% slide and grapple speed

\- \*\*Specialist bonus.\*\* Exactly \*\*1 weapon\*\* equipped replaces the stacking buffs with a flat package: +20 health, +10% speed, +15% cooldown reduction, +10% damage with that weapon. Strong, but still beatable by a well-rounded player.

\- \*\*Two weapons\*\* gets half the Specialist bonus (a "Duelist" bonus).



\## 4. Abilities System



\- \*\*F, Primary:\*\* repeatable. Short cooldown (5 to 20 s). Utility or tactical.

\- \*\*T, OP:\*\* powerful. Charges when \*\*either\*\* the weapon deals a damage threshold (about 1000 damage) \*\*or\*\* a long cooldown (60 to 90 s) completes. Whichever comes first.

\- \*\*Cooldowns are per weapon.\*\* Switching weapons doesn't pause them.

\- \*\*Style points (SP).\*\* Meter 0 to 100. Spend on abilities:

&#x20; - \*\*Flourish (hold modifier + F):\*\* 25 SP instantly resets the F cooldown.

&#x20; - \*\*Overcharge (hold modifier + T):\*\* 60 SP fills 50% of the T charge.

&#x20; - Passive: every 20 SP stored reduces all cooldowns 5% (max 25%).

\- \*\*SP earning:\*\*

&#x20; - Damage during or after slide: +5

&#x20; - Kill while grappling or airborne: +10

&#x20; - Double-jump headshot: +10

&#x20; - Multikill within 4 s: +15 per extra kill

&#x20; - No-scope or quick-scope kill: +10

&#x20; - Kill with a melee/thrown blade: +10

&#x20; - Kill streak of 3+ without dying: +20

&#x20; - SP drains slowly out of combat and drops by half on death.



\## 5. Upgrade Points



Each player has \*\*5 points\*\* to invest, \*\*max 3 in one category\*\*:



| Category | Per point |

| --- | --- |

| Vitality | +10 health |

| Agility | +4% move speed, +5% slide length |

| Dexterity | +6% reload / swap speed |

| Focus | +4% cooldown reduction, +3% T charge from damage |

| Grapple | +4 m range, -8% grapple cooldown |

| Might | +3% weapon damage |



\## 5.5 Health, Regen and Lethality



Base health is 100 (upgrades and empty-slot buffs add more).



\*\*Regen.\*\* After 10 s without taking damage, you regenerate 10 health per second until full. You also recover health from:



\- \*\*Healing abilities\*\* (tagged Heal below). They work any time and ignore the 10 s rule.

\- \*\*Regen orbs.\*\* Glowing pickups at fixed points on each map: +30 health, respawn after 45 s. A kill also drops a small orb (+10) at the victim's position for 8 s.

\- Any damage taken interrupts regen and restarts the 10 s timer.



\*\*Instakill rules.\*\* Powers tagged \*\*LETHAL\*\* can kill outright, but only if you meet their skill condition: \*\*H\*\* headshot, \*\*B\*\* hit from behind (within a 60-degree arc), \*\*P\*\* point-blank range, \*\*M\*\* timed hit on a marked target.



1\. \*\*Condition met = kill.\*\* Condition not met = reduced damage (60% of the target's max health at most), never a kill.

2\. \*\*Waiting and style never kill.\*\* Cooldowns, style points and charge only make a power available. They never add accuracy, auto-hits or lethality.

3\. \*\*Lethal Strain.\*\* If you use a lethal power and don't land the kill, you are \*\*Exposed\*\* for 5 s: +25% damage taken, -20% speed, F disabled, and that power's cooldown is 50% longer. Landing the kill cancels the penalty and refunds 50% of the cooldown. Skilled players barely pay; sloppy ones are punished.

4\. \*\*Defensive answers.\*\* Shields, barriers, armor and dodge abilities absorb or avoid lethal hits. A lethal hit blocked by a barrier deals normal damage only.

5\. \*\*Not every T is lethal.\*\* 12 of the 35 T abilities are (about a third). Every synergy combo is.



\*\*Wall penetration\*\* (all piercing sniper and railgun shots). The fewer walls a shot passes through, the more damage it does. A wall is any solid layer. Damage is a percentage of the target's max health:



| Walls passed | Headshot | Bodyshot |

| --- | --- | --- |

| 0 | 200% (kill) | 90% |

| 1 | 170% (kill) | 85% |

| 2 | 140% (kill) | 80% |

| 3 | 115% (kill) | 75% |

| 4 | 100% (kill) | 70% |

| 5 or more | Capped: leaves target at 10% health | Capped: leaves target at 30% health |



Bodyshots never kill a full-health player. Headshots through 5 or more walls never kill a full-health player either.



\## 6. Weapon Roster (35)



Every entry lists \*\*F\*\* (primary) and \*\*T\*\* (secondary / OP). Tags: \*\*Offense\*\*, \*\*Defense\*\*, \*\*Utility\*\*, \*\*Heal\*\*, and \*\*LETHAL\*\* (instakill-capable; condition in brackets, see 5.5). Numbers are starting values to tune in playtests.



\### 6.1 Rifles



1\. \*\*AK-74 "Reaper"\*\*

&#x20;  - F \*Adrenaline Burst\* (Offense): +20% fire rate for 4 s. CD 12 s.

&#x20;  - T \*Rampage\* (Offense): 6 s of explosive-tipped rounds with small splash. CD 70 s / 1200 dmg.

2\. \*\*AR-16 "Vanguard"\*\*

&#x20;  - F \*Scan Pulse\* (Utility): reveals enemies within 25 m for 3 s. CD 15 s.

&#x20;  - T \*Fortify\* (Defense, Heal): 6 s of 40% damage resistance; 10% of damage dealt heals you. CD 70 s / 1000 dmg.

3\. \*\*MK-14 "Marksman"\*\*

&#x20;  - F \*Steady Aim\* (Utility): zero recoil for 4 s. CD 10 s.

&#x20;  - T \*Executioner Rounds\* (Offense, LETHAL \\\[H\\]): next 4 shots; a headshot kills, bodyshots deal 60%. Missing all 4 triggers Exposed. CD 80 s / 1200 dmg.

4\. \*\*SCAR-X "Warden"\*\*

&#x20;  - F \*Riot Guard\* (Defense): raise a plate; front damage -50% for 3 s, move speed -20%. CD 14 s.

&#x20;  - T \*Aegis Dome\* (Defense): a 3 m dome blocks enemy bullets for 6 s; your bullets pass through. CD 80 s / 1000 dmg.

5\. \*\*Bullpup "Hornet"\*\*

&#x20;  - F \*Ricochet Rounds\* (Offense): bullets bounce once for 5 s. CD 12 s.

&#x20;  - T \*Shock Volley\* (Offense): 5 s, hits chain to enemies within 8 m. CD 75 s / 1100 dmg.



\### 6.2 Shotguns



1\. \*\*Pump "Breacher"\*\*

&#x20;  - F \*Door-Kick Sweep\* (Defense, Utility): 360° shotgun swing damages enemies within 1.6 m for 75% of a full pellet spread. CD 8 s.

&#x20;  - T \*Point-Blank Slam\* (Offense, LETHAL \\\[P\\]): next blast kills if 7 of 9 pellets hit within 4 m; otherwise 60%. CD 70 s / 1000 dmg.

2\. \*\*Double-Barrel "Twin Fang"\*\*

&#x20;  - F \*Recoil Jump\* (Utility): a blast launches you 8 m away, a quick escape. CD 10 s.

&#x20;  - T \*Slug Storm\* (Offense): 5 s of rapid slugs at 60% damage, long range. CD 70 s / 900 dmg.

3\. \*\*Auto-12 "Hailstorm"\*\*

&#x20;  - F \*Choke Tight\* (Offense): tight pattern for 5 s. CD 10 s.

&#x20;  - T \*Frenzy\* (Offense): 6 s of doubled fire rate and unlimited ammo. CD 70 s / 1000 dmg.

4\. \*\*Lever "Outlaw"\*\*

&#x20;  - F \*Quickdraw\* (Offense): instant reload and next shot +30% damage. CD 9 s.

&#x20;  - T \*Wanted Poster\* (Utility): marks an enemy through walls for 10 s, +50% damage to them. CD 75 s / 1000 dmg.

5\. \*\*Sawed-Off "Gravedigger"\*\*

&#x20;  - F \*Shoulder Charge\* (Offense): 6 m dash that knocks down the first enemy hit. CD 10 s.

&#x20;  - T \*Last Rites\* (Offense, LETHAL \\\[P\\]): within 2.5 m, kills any target under 40% health; others take 60%. 8 s window. CD 80 s / 1000 dmg.



\### 6.3 Auto (SMGs and machine guns)



1\. \*\*SMG "Hummingbird"\*\*

&#x20;  - F \*Strafe Boost\* (Utility): +25% move speed for 4 s. CD 12 s.

&#x20;  - T \*Akimbo Mode\* (Offense): dual-wield, double fire rate for 8 s. CD 70 s / 1000 dmg.

2\. \*\*Vector "Chainsaw"\*\*

&#x20;  - F \*Heat Sink\* (Utility): no overheating or reload for 5 s. CD 14 s.

&#x20;  - T \*Overdrive Shred\* (Offense): damage ramps up to +80% over 6 s. CD 75 s / 1100 dmg.

3\. \*\*Machine Gun "Warhound"\*\* \*(your design; name is a suggestion)\*

&#x20;  - F \*Tripod Mode\* (Offense): toggle. Deploy a tripod, can't move, accuracy matches a sniper while keeping MG ammo and reload. 2 s animated transition each way, no cooldown.

&#x20;  - T \*Laser Burst\* (Offense): 5 s of high-damage, high-rate beam rounds. CD 15 s (your number).

4\. \*\*Minigun "Wrath"\*\*

&#x20;  - F \*Plated Spin\* (Defense): while spinning, front damage -25%. CD 12 s.

&#x20;  - T \*Barrage\* (Offense): 6 s of unstoppable fire, no flinch. CD 80 s / 1300 dmg.

5\. \*\*P90 "Swarm"\*\*

&#x20;  - F \*Scout Drone\* (Utility): a mini drone flies out for 8 s and pings enemies. CD 16 s.

&#x20;  - T \*Repair Drones\* (Defense, Heal): 4 drones heal you 40 health over 6 s. CD 80 s / 1000 dmg.



\### 6.4 Pistols



1\. \*\*Golden Eagle "Gilded Judge"\*\*

&#x20;  - F \*Heavy Shot\* (Offense): next shot knocks back and deals 60 damage. CD 5 s.

&#x20;  - T \*Golden Hour\* (Offense, LETHAL \\\[H\\]): 6 s, headshots kill, bodyshots deal 50%. CD 75 s / 900 dmg.

2\. \*\*Glock "Switch"\*\*

&#x20;  - F \*Full-Auto Switch\* (Offense): 3 s of full-auto fire. CD 10 s.

&#x20;  - T \*Mag Dump\* (Offense): 3 extended magazines of unlimited ammo for 6 s. CD 65 s / 800 dmg.

3\. \*\*Revolver "Peacemaker"\*\*

&#x20;  - F \*Fan the Hammer\* (Offense): fire all 6 rounds in a spread. CD 8 s.

&#x20;  - T \*Dead Man's Draw\* (Offense, LETHAL \\\[H\\]): 3 s of slowed time for you; headshots kill. Missing all shots triggers Exposed. CD 80 s / 1000 dmg.

4\. \*\*Dual Berettas "Gemini"\*\*

&#x20;  - F \*Split Fire\* (Offense): each gun targets a different enemy for 4 s. CD 12 s.

&#x20;  - T \*Twin Lock\* (Offense): aim assist on 2 enemies for 6 s at 60% damage. CD 75 s / 1000 dmg.

5\. \*\*Machine Pistol "Stinger"\*\*

&#x20;  - F \*Slide Spray\* (Offense): +40% accuracy and damage while sliding for 5 s. CD 10 s.

&#x20;  - T \*Hornet Nest\* (Offense): bullets cause bleed that spreads on kills. CD 70 s / 900 dmg.



\### 6.5 Snipers



1\. \*\*"Ghostline"\*\* \*(your design; name is a suggestion)\*

&#x20;  - F \*Quick-Scope Lock\* (Offense): if the target is within a short range, for 10 s any shot lands on the body center as long as they are within a small pixel radius of the crosshair. Headshots still need real aim. CD 20 s, reduced by style.

&#x20;  - T \*Wall Piercer\* (Offense, LETHAL \\\[H\\]): shots pass through walls, following the wall table in 5.5. Stays active until you score a kill or fire 6 shots.

2\. \*\*Barrett "Hammerfall"\*\*

&#x20;  - F \*Held Breath\* (Utility): 5 s of zero sway and extended zoom. CD 12 s.

&#x20;  - T \*Shatter Round\* (Offense, LETHAL \\\[H\\]): destroys cover and knocks enemies back; headshots through 0 to 1 walls kill. CD 70 s / 1000 dmg.

3\. \*\*Bolt-Action "Longshot"\*\*

&#x20;  - F \*Instant Chamber\* (Offense): no bolt cycle for 8 s. CD 14 s.

&#x20;  - T \*Overwatch\* (Utility): marks anyone who enters your scope for 10 s. CD 75 s / 1100 dmg.

4\. \*\*Semi-Auto "Stormline"\*\*

&#x20;  - F \*Retreat Dash\* (Defense): 8 m backwards dash while scoped. CD 12 s.

&#x20;  - T \*Tracer Barrage\* (Offense): shots slow enemies hit by them. CD 70 s / 1000 dmg.

5\. \*\*Railgun "Specter"\*\*

&#x20;  - F \*Capacitor Charge\* (Offense): hold to charge, next shot pierces one wall. CD 12 s.

&#x20;  - T \*Rail Beam\* (Offense, LETHAL \\\[H\\]): 2 s visible charge, then a beam that follows the wall table in 5.5. CD 90 s / 1300 dmg.



\### 6.6 Blades



1\. \*\*Katana\*\*

&#x20;  - F \*Dash\* (Offense, Utility): short forward dash with a slash. CD 0.5 s.

&#x20;  - T \*Stealth\* (Offense, LETHAL \\\[B\\]): 3 s of high invisibility and +10% speed; extended by +0.5 s per katana kill (resets on use) and by style. A strike from behind within 60 degrees kills; a front strike deals 60%. Enemies within 5 m see a faint shimmer. Taking damage breaks it. CD 20 s / 800 dmg.

2\. \*\*Karambit\*\*

&#x20;  - F \*Quick Carve\* (Offense): for 5 s, when in melee range you deal damage and land at a random position away from your start. CD 20 s, reduced by style.

&#x20;  - T \*Surgery\* (Offense, LETHAL \\\[H\\]): 7 s, instant kill if aimed at the head; extended jump-on range. Great against groups. CD 20 s, reduced by style.

3\. \*\*Throwing Knives "Fan"\*\*

&#x20;  - F \*Knife Volley\* (Offense): throw 3 knives in a spread. CD 7 s.

&#x20;  - T \*Recall\* (Offense): all thrown knives teleport back, damaging everything along the path. CD 70 s / 900 dmg.

4\. \*\*Machete "Jungle Cleaver"\*\*

&#x20;  - F \*Rend\* (Offense): slash applies bleeding for 5 s. CD 9 s.

&#x20;  - T \*Frenzy\* (Offense, Heal): 6 s of +40% attack speed and 25% lifesteal. CD 75 s / 900 dmg.

5\. \*\*Dual Daggers "Viper Fangs"\*\*

&#x20;  - F \*Venom Coat\* (Offense): hits slow and poison for 5 s. CD 12 s.

&#x20;  - T \*Blink Strike\* (Offense, LETHAL \\\[B\\]): teleport behind the closest enemy in view. Kills if they are not facing you within 0.4 s of arrival; otherwise 60%. CD 70 s / 800 dmg.



\### 6.7 Explosives



1\. \*\*RPG "Hellfire"\*\*

&#x20;  - F \*Guided Missile\* (Offense): steer the rocket with your camera for 4 s. CD 14 s.

&#x20;  - T \*Cluster Rocket\* (Offense): splits into 6 bomblets on impact. CD 80 s / 1200 dmg.

2\. \*\*Molotov "Inferno Flask"\*\*

&#x20;  - F \*Fire Wall\* (Defense): a line of flame blocks a corridor for 6 s. CD 14 s.

&#x20;  - T \*Firestorm\* (Offense): a large area burns for 10 s and spreads over wooden surfaces. CD 80 s / 1000 dmg.

3\. \*\*Frag Grenade "Hailer"\*\*

&#x20;  - F \*Smoke Grenade\* (Defense): 8 m smoke cloud blocks vision for 8 s. CD 14 s.

&#x20;  - T \*Chain Grenade\* (Offense): each explosion spawns another grenade, up to 3 times. CD 75 s / 1000 dmg.

4\. \*\*Mine "Claymore"\*\*

&#x20;  - F \*Directional Mine\* (Offense): cone blast, can be placed on walls and ceilings. CD 10 s.

&#x20;  - T \*Minefield\* (Offense, LETHAL \\\[P\\]): places 5 mines instantly. Each mine arms in 2 s, glows faintly, and can be shot to disarm. An enemy within 2 m of the cone's center is killed; otherwise 50%. CD 80 s / 1100 dmg.

5\. \*\*C4 "Detonator"\*\*

&#x20;  - F \*Sticky Charge\* (Offense): sticks to surfaces and players, detonate manually. CD 12 s.

&#x20;  - T \*Remote Barrage\* (Offense): all placed charges detonate with double radius at 60% damage. CD 75 s / 1000 dmg.



\## 7. Synergy Combos



When both weapons are equipped, a combo can \*\*replace the T ability\*\* of one (the player picks which in the Synergy tab). Only one combo is active at a time. Combo T abilities charge from damage by \*\*either\*\* weapon (about 2500 damage) or a \\\~120 s cooldown.



\*\*Every combo is lethal-capable and skill-gated\*\* under the 5.5 rules: the kill needs the listed condition, style and waiting never grant it, and a failed attempt leaves you Exposed. Combos are about 30% stronger than a default T. Extra guardrails:



\- \*\*Short windows.\*\* Combo effects last 6 to 8 s.

\- \*\*Telegraphed.\*\* Each combo has a loud audio cue and a visible effect on the user that enemies within 40 m can notice.

\- \*\*Interruptible.\*\* A stun, a flash or a single hit of 40+ damage cancels or interrupts most effects (noted per combo).

\- \*\*Synergy Guard.\*\* A player with a synergy loadout survives the first lethal hit they take in any 20 s window with 10% health, so combo users are not guaranteed kills against each other. Normal damage is unaffected.

\- \*\*Price of entry.\*\* You must carry two specific weapons, which narrows your coverage compared with a balanced loadout.



1\. \*\*Ghostline sniper + Katana: "Phantom Sight."\*\* Replaces Wall Piercer. For 8 s, your screen goes black except for outlines of players within 60 m, and you can shoot them through walls. LETHAL \\\[H\\]: headshots follow the wall table in 5.5, so walls still reduce damage. 4 shots maximum. Outlines are small targets, and taking damage restores your vision for 1.5 s. Enemies within 40 m hear a scope hum. One katana dash is allowed while active.

2\. \*\*Warhound MG + Hellfire RPG: "Warlord."\*\* In tripod mode, a rocket barrel fires one slow rocket (70 m/s) every 3 s for 6 s. LETHAL \\\[direct hit\\]: a direct hit kills, splash deals 40%. Rockets can't fire during the 2 s tripod transition. A missed rocket forces you to stay deployed (Exposed).

3\. \*\*Karambit + Claymore: "Ambush Predator."\*\* For 8 s, each Quick Carve leaves a mine at your start point (max 3 active). LETHAL \\\[P\\]: an enemy within 1.5 m of the mine's center is killed. Mines arm in 2.5 s, glow faintly within 10 m, and can be shot to disarm.

4\. \*\*Hummingbird SMG + Inferno Flask: "Wildfire."\*\* For 8 s, bullets ignite enemies. LETHAL \\\[sustained tracking\\]: 12 hits on one target within 1.5 s causes Flashpoint, a lethal burst after 1.2 s. The target can cancel it by sliding or entering water, and fire trails behind you do not kill by themselves.

5\. \*\*Peacemaker revolver + Throwing Knives: "Wild West."\*\* A knife hit pins the target in place for 1.5 s (they can still shoot). LETHAL \\\[H\\]: a revolver headshot on a pinned target kills; a bodyshot deals +60% damage. Pin breaks on a 40+ damage hit from someone else.

6\. \*\*Breacher shotgun + Katana: "Close Quarters Dance."\*\* For 8 s you get 3 dash charges (0.5 s apart; a kill refunds one). LETHAL \\\[P\\]: a blast within 3 m kills if 7 of 9 pellets hit. Each blast also chains to one nearby enemy for 40% damage.

7\. \*\*Longshot sniper + RPG: "Orbital Marker."\*\* A sniper hit marks one target. After a 1.5 s warning (visible marker and audio cue), a rocket lands in a 4 m circle. LETHAL \\\[M\\]: kills anyone still within 2 m of the center. Moving out of the circle avoids it.

8\. \*\*Gilded Judge pistol + Viper Fangs daggers: "Duelist."\*\* Pick a target within 15 m (they get a warning). For 6 s an 8 m ring blocks third-party projectiles. LETHAL \\\[H\\]: a headshot from either duelist kills the other, and both deal +25% damage. Either duelist can leave the ring to end it. You can't challenge another Duelist.

9\. \*\*Reaper AK + Hailer grenade: "Frag Rain."\*\* For 8 s, every 15th bullet drops a mini grenade at the target. LETHAL \\\[H\\]: if the triggering bullet is a headshot, the grenade drops on their head and kills; on a bodyshot it deals 35 damage. Self-damage is on.

10\. \*\*Railgun Specter + Grapple upgrade (2+ points): "Rail Swing."\*\* For 7 s, rail charge is 50% faster while swinging and shots pierce one extra wall. LETHAL \\\[H\\]: needs 1.5 s of charge and the wall table in 5.5. Releasing the hook ends the bonus after 1 s; a miss leaves you airborne with the hook on a 6 s cooldown.



\*Design note: combos should be discoverable. Show a small "Synergy available" icon in the loadout menu without revealing exactly what it does.\*



\## 8. Maps



Each map is built to favor a different player type and a different loadout approach.



\### 8.1 Hollow Ward (close quarters, mines and sniping)



\*Setting:\* An abandoned psychiatric hospital and prison compound at night, half-lit by flickering emergency lights.



\*Feel:\* Tight corridors, small rooms and stairwells where reaction time and shotguns, SMGs, mines and blades dominate. A few long lines of sight keep snipers relevant.



\*Key areas:\*



\- \*\*The Wards:\*\* a maze of narrow hallways with doors you can kick open (shotgun F synergy), ideal for mines and C4.

\- \*\*Operating Theater:\*\* circular room with a glass ceiling; fights happen at all heights.

\- \*\*The Yard:\*\* a long open courtyard surrounded by wire and towers. Two sniper roosts watch the whole thing; cover is limited to a few concrete walls.

\- \*\*Boiler Basement:\*\* steam vents block vision, ideal for stealth and Katana plays.

\- \*\*Grapple points:\*\* limited, mostly inside the Yard and on roof edges, so mobility feels earned.



\*Best loadouts:\* Shotgun, SMG, Claymore and Karambit for the interior, one Ghostline for the roosts.



\### 8.2 Canopy Fall (jungle, swinging and quick-scopes)



\*Setting:\* Ancient temple ruins swallowed by jungle, with rope bridges, vine walls and a waterfall in the center.



\*Feel:\* Vertical and fast. Grapple everywhere. Fights are quick-scope duels in the canopy and ambushes from vines.



\*Key areas:\*



\- \*\*The Canopy Ring:\*\* a circle of treetop platforms connected by vines and rope bridges. Grapple-heavy, no ground cover.

\- \*\*Temple Steps:\*\* a stepped pyramid with narrow windows that make great quick-scope spots.

\- \*\*Waterfall Pool:\*\* a low area with slow water; slide through it to cross quickly.

\- \*\*Root Tunnels:\*\* short underground passages under the roots, used for flanking and Katana stealth.

\- \*\*Hazards:\*\* fog banks reduce long-range vision; destructible vine walls open new routes.



\*Best loadouts:\* Ghostline sniper (quick-scope lock), Throwing Knives, Machete, Pistols, and anything with Grapple upgrades.



\### 8.3 Skyfoundry (the perfect mix)



\*Setting:\* A collapsed industrial city. Skeleton skyscrapers surround a huge steel foundry floor, with catwalks connecting everything.



\*Feel:\* Tuned so that no single style dominates. The core is CQC; the perimeter is long-range; the vertical routes connect them.



\*Key areas:\*



\- \*\*The Foundry Floor:\*\* big central room with machinery cover, flames and molten channels. Medium range; rifles and autos shine.

\- \*\*The Catwalk Web:\*\* suspended walkways crossing the foundry at three heights. Grapple and slide combos, lots of ambush spots.

\- \*\*Tower Spines:\*\* three skeleton buildings around the foundry with sniper nests on top and fast zip-line style grapple points down.

\- \*\*Tunnel Network:\*\* underground service tunnels linking the towers; tight CQC and mine spam.

\- \*\*Scrapyard:\*\* open outer ring with wreckage for cover; mid- to long-range duels.



\*Best loadouts:\* Balanced mixes: a rifle, a blade, one explosive and one sniper. Specialists can still win by playing to their zone.



\## 9. Balance Flags to Revisit



\- \*\*Lethal share.\*\* 12 of 35 T abilities and all 10 combos can kill. If more than a third of lethal attempts land in playtests, tighten the conditions rather than the cooldowns.

\- \*\*Cooldown mismatch.\*\* Karambit Surgery (20 s) is lethal and shorter than a typical T. I suggest 45 s base (your 20 s with style reduction is the target, not the default). The MG laser (15 s) is non-lethal but the same issue applies.

\- \*\*Wall shots.\*\* Lethal wallbangs work through 0 to 4 walls, so central lanes need at least 5 wall layers or sound cues to stay fair.

\- \*\*Stealth Katana.\*\* Backstab kills plus the Specialist bonus can be oppressive. Playtest the shimmer radius (5 m) and a visibility floor.

\- \*\*Exposed penalty.\*\* 5 s may be too harsh or too light. It should feel painful, not match-ending.

\- \*\*Regen.\*\* 10 s timer and 10 health per second may let players disengage too easily. Test with 7 s and 8 health per second.

\- \*\*Orbs.\*\* Orbs reward map control. If one team camps them, move them or lengthen the respawn.

\- \*\*Style drain.\*\* If SP is easy to farm via slide spam, add diminishing returns.



\## 10. Suggested Roadmap



1\. \*\*Prototype:\*\* movement (slide, double jump, grapple) on a gray-box map. Don't add weapons until movement feels good.

2\. \*\*Weapons core:\*\* one weapon per type with F and T.

3\. \*\*Loadout menu and upgrade points.\*\*

4\. \*\*Style system and cooldown tuning.\*\*

5\. \*\*Remaining 28 weapons and combos in batches.\*\*

6\. \*\*Maps:\*\* greybox all three, then art pass. Hollow Ward first (smallest).

7\. \*\*Playtest and balance.\*\*



\## 11. Implementation Plan



\*\*Decision:\*\* build a browser game with a \*\*Rust simulation core\*\* shared by client (WebAssembly) and server (native), a \*\*TypeScript + Three.js\*\* renderer, and \*\*authoritative dedicated game servers\*\* for multiplayer. Vercel hosts the client and the lobby API. Game servers run elsewhere, because Vercel Functions can't hold persistent WebSocket or UDP-style connections.



\### 11.1 Tech Stack



| Layer | Choice | Why |

| --- | --- | --- |

| Simulation (movement, weapons, abilities, bots) | Rust crate `game-core` | Fast, deterministic, one codebase for client prediction, server authority and single player |

| Physics and collision | Rapier (Rust) with a custom kinematic controller | Slide, double jump, grapple and wallbang raycasts need custom code; Rapier handles queries and static geometry |

| Client renderer | TypeScript, Three.js (WebGL2 by default, WebGPU opt-in) | Largest ecosystem, good instancing and post-processing; WebGPU is a later upgrade |

| Client build | Vite, Turborepo monorepo (`apps/web`, `crates/game-core`, `crates/server`) | Fast iteration; WASM built with wasm-pack |

| ECS (client render state) | bitECS | Cache-friendly, low garbage |

| Game server | Rust binary (tokio, tungstenite, later WebTransport) | One process runs many matches; low CPU per match |

| Lobby, auth, matchmaking, stats | Vercel Functions (TypeScript) + Neon Postgres or Upstash Redis | Fits serverless; no persistent connections needed |

| Game server hosting | Fly.io Machines (one region per player cluster), started on demand by the matchmaker | Persistent processes, global regions, per-match scaling |

| Assets | glTF with meshopt compression, KTX2 textures, served from Vercel's CDN | Small downloads, GPU-ready textures |



\### 11.2 Multiplayer Model (chosen)



\*\*Server-authoritative simulation at 60 ticks per second, with client-side prediction and lag compensation.\*\* Reasons: it prevents most cheating, keeps lethal-ability rules (5.5) enforceable, and feels responsive.



\- \*\*Transport:\*\* binary WebSocket first; add WebTransport (unreliable datagrams) where the browser supports it, with WebSocket as fallback.

\- \*\*Inputs:\*\* client sends input commands every tick (move, look, buttons, ability keys). The server never trusts positions.

\- \*\*Prediction:\*\* the client runs the same `game-core` movement code in WASM, then reconciles when a server snapshot disagrees.

\- \*\*Snapshots:\*\* server sends delta-compressed, bit-packed snapshots at 30 Hz. Remote players are interpolated 100 ms behind.

\- \*\*Hit detection:\*\* server-side lag compensation. It rewinds player hitboxes up to 200 ms to the shooter's view time, then runs the hitscan or wall-penetration ray.

\- \*\*Abilities and cooldowns:\*\* fully server-side. Clients show predicted effects (sound, glow) and the server confirms or cancels them. Lethal hits, Exposed status and Synergy Guard are decided only on the server.

\- \*\*Information hiding:\*\* the server sends only players in a player's view or hearing range. Special vision (Phantom Sight outlines, Scan Pulse) sends extra positions only while the ability is active.

\- \*\*Anti-cheat basics:\*\* speed and teleport checks, input rate limits, signed match tokens from the Vercel API, server-side recording of suspicious aim stats.



\### 11.3 Game Modes



| Mode | Type | Players | Priority |

| --- | --- | --- | --- |

| Free-for-all | Multiplayer | 8 to 12 | v1 |

| FFA elimination, single round vs bots | Single player | 1 + 7 bots | v1 |

| Bot waves (survival) | Single player | 1 | v1 |

| Team deathmatch 5v5 | Multiplayer | 10 | v2 |

| Team vs team with bots | Single player | 5v5 with bots | v2 |

| Co-op wave survival | Multiplayer | 1 to 4 | v3 |



Single player runs the exact same `game-core` in WASM in a Web Worker, with no server, so it works on a pure static Vercel deploy. Multiplayer uses the same game logic on the Rust server.



\### 11.4 Bots



\- \*\*Navigation:\*\* navmesh baked per map (Recast) and loaded by `game-core`. Grapple points are extra links so bots can swing.

\- \*\*Brain:\*\* utility AI scoring (attack, retreat to heal orb, reposition, use ability) with a behavior tree for movement.

\- \*\*Skill tiers:\*\* Easy, Normal, Hard, Elite vary reaction time (350 to 120 ms), aim error, ability usage and lethal-power accuracy. Bots obey the same lethal and Exposed rules as players.

\- \*\*Loadouts:\*\* each bot picks a loadout archetype (Rusher, Sniper, Demolition, Stealth) and sometimes a combo.

\- \*\*Waves:\*\* each wave adds bots and one rule twist (for example, all snipers, or no regen orbs). Boss wave every 5 waves.



\### 11.5 Rendering and Look



Target a \*\*stylized, high-contrast look\*\* that runs fast: clean low-poly shapes, strong lighting, emissive ability effects. It reads clearly in motion and is cheaper than photorealism.



\- \*\*Lighting:\*\* baked lightmaps and light probes for maps, 1 to 2 dynamic shadow-casting lights, cascaded shadows only for the sun.

\- \*\*Materials:\*\* a small set of shared PBR-lite materials, texture atlases, instancing for repeated props. No overdraw-heavy transparency.

\- \*\*Post-processing (budgeted):\*\* tone mapping, bloom, light SSAO, optional motion blur on slides. One combined pass where possible.

\- \*\*Particles:\*\* GPU particles for muzzle flashes, fire, smoke, impact decals (pooled).

\- \*\*Ability visuals:\*\* each ability has a clear color and silhouette. Phantom Sight uses a stencil-based outline pass over a black screen.

\- \*\*Weapon models:\*\* first-person arms and weapons rendered in a separate pass with their own FOV so they never clip into walls.

\- \*\*Culling:\*\* frustum and occlusion culling via map-authored portals or zones; LOD on characters and props.



\### 11.6 Gameplay Feel Rules



\- \*\*Input latency is the top priority.\*\* Sample input at render frame start, send each tick, predict instantly.

\- \*\*Movement tuning:\*\* ground speed 6 m/s, sprint 8.5 m/s, slide starts at 10 m/s and decays over 1.2 s, double jump gives 70% of first jump height, gravity 24 m/s2 (snappier than real life). Air control moderate; no auto-bunny hop.

\- \*\*Grapple feel:\*\* hook fires instantly, pulls with spring physics, 4 s cooldown, release preserves momentum.

\- \*\*Camera:\*\* FOV 100 default (90 to 120 adjustable), slight FOV kick on sprint and slide, tiny head bob (can be disabled). No forced motion blur.

\- \*\*Weapons:\*\* recoil patterns are readable and learnable; each weapon has a distinct sound, a hit marker, and a headshot sound. Kill feed and a short kill cam in FFA.

\- \*\*Feedback for rules:\*\* a clear screen flash and sound when Exposed starts, a faint warning when you are marked, an audible cue for combos.

\- \*\*Accessibility:\*\* colorblind-safe team colors, toggles for screen shake, bloom and flashes, rebindable keys (G and V are already configurable).



\### 11.7 Performance Budgets



| Item | Budget |

| --- | --- |

| Frame time | 6.9 ms (144 FPS) on a mid-range desktop GPU, 16.6 ms (60 FPS) on integrated laptop GPUs |

| Draw calls | 800 or fewer |

| Visible triangles | 1.5 million or fewer |

| Texture memory | 512 MB or less, KTX2 compressed |

| JavaScript and WASM per frame | 3 ms or less (no per-frame allocations) |

| Initial download | Under 5 MB to reach the menu; maps stream in under 40 MB |

| Server | 60 Hz tick under 8 ms for a full 12-player match; at least 20 matches per CPU core target |



Use an adaptive quality system (resolution scale, shadow quality, particle density) driven by a frame-time governor.



\### 11.8 Deployment on Vercel



\- \*\*Vercel:\*\* static client, Edge CDN assets, API routes for login, party and matchmaking, leaderboards and stats.

\- \*\*Matchmaker flow:\*\* client asks the Vercel API for a match, the API picks a region and starts or finds a Fly.io game server, returns a signed token and server address, and the client connects directly.

\- \*\*Single player:\*\* needs only the static deploy. No server.

\- \*\*CI/CD:\*\* GitHub Actions builds the Rust server and pushes it to Fly; Vercel deploys the client on each push. Preview deployments use a staging server pool.

\- \*\*Observability:\*\* server tick-time and packet-loss metrics, client FPS and ping reported to the stats API, error tracking.



\### 11.9 Milestones



| Milestone | Deliverable | Rough duration |

| --- | --- | --- |

| M1 | Greybox map, first-person movement (slide, double jump, grapple) in Three.js with WASM controller | 3 weeks |

| M2 | `game-core`: weapons, damage, regen, orbs, health rules; one weapon per type with F and T | 4 weeks |

| M3 | Single-player FFA vs bots and wave survival on Hollow Ward | 3 weeks |

| M4 | Authoritative server, prediction, interpolation, lag compensation; multiplayer FFA | 5 weeks |

| M5 | Full 35-weapon roster, lethal rules, Exposed, Synergy Guard, all 10 combos | 6 weeks |

| M6 | Maps Canopy Fall and Skyfoundry with lightmaps, navmesh and grapple points | 5 weeks |

| M7 | Team deathmatch, team-vs-team bots, co-op waves, loadout menu and upgrades | 4 weeks |

| M8 | Visual polish, audio, accessibility, balance pass, closed beta | 4 weeks |



Durations assume a small team of 3 to 4 developers and an artist; a solo developer should plan on roughly 2 to 3 times as long.



\### 11.10 Main Risks



\- \*\*Browser multiplayer latency.\*\* WebSocket is TCP, so packet loss causes stalls. Mitigate with WebTransport where available, small snapshots, and a regional server pool.

\- \*\*Rust plus WASM plus TypeScript complexity.\*\* Keep a thin, stable binding layer and test `game-core` natively.

\- \*\*Content volume.\*\* 35 weapons and 10 combos is a lot. Ship v1 with one weapon per type and expand in batches (M2 then M5).

\- \*\*Wallbang fairness and instakill balance.\*\* Build tuning knobs into data files so designers can adjust without code changes.


