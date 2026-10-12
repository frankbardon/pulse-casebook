# Cohort for film 8 (tests and regressions). Deterministic: seed 7.
import random,math
random.seed(7)
L=["arm,region,spend,visits,tenure,converted"]
for i in range(240):
    arm=random.choice(["A","B"]); reg=random.choice(["North","South","East"])
    v=random.randint(1,12); ten=round(random.uniform(1,10),2)
    sp=round(20+3.1*v+1.5*ten+(6 if arm=="B" else 0)+random.gauss(0,8),2)
    p=1/(1+math.exp(-(-3+0.35*v+(0.6 if arm=="B" else 0))))
    L.append(f"{arm},{reg},{sp},{v}.5,{ten},{'yes' if random.random()<p else 'no'}")
open("t.csv","w").write("\n".join(L)+"\n")
