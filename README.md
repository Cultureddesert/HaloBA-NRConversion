# Halo: Bolt Action – New Recruit game system

Generated from `Unit_cost_calculator_v3_7.html`.

Credit to nightovizard.

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

Datasheet and editing
- Models: squads have a "Models" counter that starts at the minimum unit size and goes up to the maximum. The unit profile's Models value shows the current count (team upgrades that add a crew member count too). Each veterancy option shows the unit's full starting cost in its description; its own price is what's left after the models are paid for (so squads show 0 there and the per-model price changes with veterancy).
- Damage Value: infantry and teams show 3+/4+/5+ for Inexperienced/Regular/Veteran, or 6+ with Resilient. Vehicles show their listed value.
- Per-model costs: squad upgrades are per model unless the HTML marks them flat, and per-model prices follow the model count (doctrines and armoury items too).
- Options are split into sections: Veterancy, Doctrine, NCO Weapon, Squad Upgrades, Weapon Replacements, Vehicle Upgrades, Weapon Upgrades, Armoury, Leader Melee Upgrade.
- Weapons: each unit lists one profile per weapon with a Qty column. Squads start with every model on the default weapon; NCO swaps, weapon replacements, M301 packages, vehicle and team upgrades move models between weapons. A weapon that's fully replaced disappears; optional weapons appear once taken. Melee weapons aren't listed, like the HTML.
- Leaders who choose their weapons (Officers, Medics, Forward Observers, Watchers, Chaplains, Bloodhandlers): the leader picks in "NCO Weapon" (defaults to the first weapon), and each extra model picks in "Model Weapons". The number of picks must match the extra models (an error shows until it does). For UNSC, M301 packages are among the Model Weapons picks. Only the picked weapons are shown.
- Weapon swap limits: as in the HTML, a squad can't make more weapon swaps (Weapon Replacements, including M301 packages) than it has non-NCO models; the NCO has its own pick. "The NCO and up to N men" lets the NCO take the weapon on top of N. "One model may" (Promethean Knight Incineration Cannon) is shared with the NCO, and the M301 limit (1 per 4 models) counts an NCO M301. Flood Elite/Brute Combat Form and Combat Form limits follow Armies of the Flood v3.7 (the HTML had them one too high). Breaking a limit shows an error.
- Weapon rules (e.g. Range Finder, Howitzer) appear in a unit's rules only for weapons it carries: starting weapons' rules are on the unit, and an option that adds a weapon brings that weapon's rules with it.
- Lists made with an earlier version of these files: the old "Additional Models" option became "Models", so re-check unit sizes in saved lists.

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

Filled in from the rules PDFs (Rulebook v3.7, army books v3.7/v1.3, Leaders v1.2)
- Rule text for the 23 rules the HTML had no description for (vehicle rules from the Rulebook, All-Terrain, Rappelling Lines, Gravity Lift, Scrap Armour Screens, and short versions of the three doctrine rules).
- Banished Flamethrower Team (60/75 pts, 2 Grunts, Ravager), which is in Armies of the Banished but missing from the HTML.
- Army restrictions: Spartan units are hidden in an Insurrection army; Brute units are hidden in a Swords of Sanghelios army (the HTML did this too).
- Yapyap the Destroyer: Banished vehicles the Covenant list doesn't have appear once he's the Army Leader.
- Flood "Corrupted Arsenal": vehicles from the other armies that can be Inexperienced, marked "[Corrupted Arsenal]", Inexperienced only.

- Slow Load, Unreliable and Medical Vehicle use the Bolt Action 3rd Edition rulebook text (p151, p149).
- "Slower" uses the Rulebook's vehicle "Slow" rule (6" Advance, 12" Run).
- Points: the v3.7 army books win where they differ from the HTML. Every unit's base cost was checked; only the AV-49 Wasp differed (Veteran 138 -> 135). Override list: COST_OVERRIDES in tools/build.js.
- Option and upgrade costs were also checked against the army books and Optional Rules v1.8. Fixed (OPTION_FIXES in tools/build.js): Flood Elite Combat Form Squad gains the missing "Unarmed for -8pts" swap; Covenant Attached Brute swaps are Mauler -6, Covenant Carbine -4, Plasma Rifle -1; Banished Attached Brute swaps are Mangler -5, Pulse Carbine -3, Plasma Rifle -1. Everything else matched. Upgrade limits (how many models may take an option) were not compared.
- Banished Attached Brute: the PDF lists "Engineers: If Engineers are taken" under its rules but no Engineers option; the HTML's +1pt Engineers option is kept.
