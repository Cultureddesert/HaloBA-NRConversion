# Halo: Bolt Action – New Recruit game system

Generated from `Unit_cost_calculator_v3_7.html`.

Files
- `Halo Bolt Action.gst` – game system (points cost type, Weapon/Unit profile types, categories, force layout, 114 weapon profiles, all shared rules)
- `Halo - UNSC.cat`, `Halo - Covenant.cat`, `Halo - Banished.cat`, `Halo - Forerunner.cat`, `Halo - Flood.cat` – armies (193 units/vehicles total)
- `tools/` – the converter, to regenerate after you change the HTML (`sh run.sh your.html`, needs Node)

Loading
1. Install the NewRecruit Data Editor (github.com/giloushaker/nr-editor, Releases page) and open this folder as a system, to check/fix anything it flags.
2. To use it in New Recruit itself and share it with friends: put these files in a GitHub repo, then in New Recruit use "Add from GitHub" with the repo address.

Not ported from the HTML (needs manual work in the editor)
- Simplified-validation toggle (New Recruit always shows every error; they are warnings, not blocks), PDF export (New Recruit has its own)
- Rules that conflict with each other are noted in the upgrade's comment, not enforced

Army validation (ported)
New Recruit flags these as list errors, same as the HTML's "illegal list" warnings:
- At least 1 Platoon Commander, and 2 Rifle Platoon Infantry units per Platoon Commander (minimum 2). Medics, Forward Observers/Watchers, Chaplains/Bloodhandlers, Company Commanders and attached leaders don't count as Rifle Platoon Infantry.
- Transports: 1 per Infantry/Team/Artillery unit or Platoon Commander.
- Armoured platoons: if you take any combat vehicles, at least 2, plus 1 Command Vehicle per 5 combat vehicles (rounded up). Any eligible ground vehicle can buy "Command Vehicle" for +10 pts (the HTML's Force Command Vehicle box).
- Per army: max 1 Company Commander, Deacon, Champion, Knight Commander and Juggernaut Key Mind. Medics, Observers/Watchers and Chaplains/Bloodhandlers: max 1 each per Platoon Commander.
- Doctrines: Skirmisher max 2 per Platoon Commander and 4 per army; Recon max 2 per army; Jackal Skirmishers max 2 per army. Illegal Skirmisher/Recon picks show as "(Illegal) ..." and raise an error.
- Every "Limited" rule (per army and per platoon) becomes a limit on that unit.
- Special leaders: each leader's requirements from the HTML (e.g. Cutter needs 4 ODST Infantry and an ODST Platoon Commander; Jega allows no more Brute than Elite Infantry; Yapyap needs the Cannon Fodder caste). The leader's entry also lists them in text.
- To do this, units carry extra role keywords (e.g. "Rifle Platoon Infantry", "Elite Platoon Commander"); some appear only after you pick a doctrine or upgrade. Errors name the role, e.g. "Marine Infantry".

Armoury items (ported)
- Appear as upgrades on eligible units: MJOLNIR Systems, XM20P Grenades (limit = number of Platoon Commanders), Sacred Relic (one per army), Shielded Hull (Swords Banshee), Plasma Capacitor Cells, Scrap Armour Screens, Trophy Plate Harness, Brute Grenadiers, Volatile Biomass, Spore Cloud, Burrowing Tendrils, Reconstruction Matrix, Hard-Light Calibration, Translocation Deployment.
- Per-model costs scale with the number of Additional Models. Doctrine/veterancy/army-option requirements hide the item when not met.
- Volatile Biomass adds its own profile and rule text alongside the base Explosive Biomass ones (you can't remove the base ones in the data); Hard-Light Calibration and Brute Grenadiers describe their weapon changes in text rather than editing the profiles.

M301 packages and leader melee combos (ported)
- M301: UNSC Marine, ODST and Spartan infantry (by name, or by picking that doctrine) get "Assault Rifle / Battle Rifle / Infantry Flamethrower + M301 Grenade Launcher" packages at +22 pts over the base weapon, limited to 1 per 4 models (the limit grows as you add models). The NCO weapon list gets the same combos, available once the unit has 4+ models.
- Leader melee (Covenant and Banished): once a unit has Melee Weapon or Melee Weapons, Elites can take Plasma Rifle/Needler + Plasma Sword (+5) and Brutes can swap Spiker/Plasma Rifle for a Gravity Hammer (0). Tough Fighters units get the 1 pt discount. Officers, Chaplains, Bloodhandlers and Forward Observers get these as a separate "Leader Melee Upgrade" choice instead of an NCO weapon.
- Swords and hammers only appear for the matching caste (Elite or Brute doctrine, or an Elite/Brute unit).

Rules with no description in the HTML (stubbed, fill in text): Reinforced Front Armour, Slow Load, Weak Sides, Faster, Slower, Command Vehicle, Open-topped, Medical Vehicle, Fist, Agile, Recce, Shielded Hull, All-Terrain, Nimble, Rappelling Lines, Impulse Drive, Sustained Beam, Gravity Lift, Unreliable, Scrap Armour Screens, and the three doctrine trigger rules (For Humanity's Survival!, For The Great Journey!, Forged In Chains).
