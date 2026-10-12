# Cohorts for film 10 (overlays): o.csv (2024-2025) and o2025.csv (the 2025 slice,
# used as the facet against population o.pulse). Deterministic: seed 5.
import random, csv, datetime, math
random.seed(5)
rows=[]; rid=0
for m in range(24):
    y=2024+m//12; mo=m%12+1
    n=int(40+ m*1.2 + 8*math.sin(mo/12*2*math.pi) + random.gauss(0,3))
    for _ in range(n):
        rid+=1
        region=random.choices(['North','South','East'],[0.4,0.35,0.25])[0]
        pw={'North':[0.5,0.3,0.2],'South':[0.35,0.4,0.25],'East':[0.3,0.3,0.4]}[region]
        plan=random.choices(['Basic','Plus','Pro'],pw)[0]
        base={'Basic':20,'Plus':45,'Pro':90}[plan]
        rev=round(base*random.uniform(0.8,1.3),2)
        d=datetime.date(y,mo,random.randint(1,28))
        rows.append([rid,region,plan,rev,d.isoformat(),y])
with open('o.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['id','region','plan','revenue','signup','year']); w.writerows(rows)
with open('o2025.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['id','region','plan','revenue','signup','year']); w.writerows([r for r in rows if r[5]==2025])
