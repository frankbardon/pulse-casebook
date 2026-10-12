# Cohort for film 9 (matrices). Deterministic: seed 11.
import random, csv
random.seed(11)
cl=lambda x:max(1,min(7,round(x)))
rows=[]
for i in range(300):
    seg=random.choice(['Bronze','Silver','Gold'])
    sh={'Bronze':-0.6,'Silver':0,'Gold':0.7}[seg]
    A=random.gauss(sh,1); B=random.gauss(-sh*0.5,1)
    s=[cl(4+1.1*A+random.gauss(0,0.8)) for _ in range(3)]
    r4=cl(4-1.0*A+random.gauss(0,0.9))
    v=[cl(4+1.0*B+random.gauss(0,0.8)) for _ in range(3)]
    age=round(random.uniform(22,65)); tenure=round(max(0,age-22+random.gauss(0,3))); income=round(30+0.9*age+random.gauss(0,12),1)
    v3='' if random.random()<0.1 else v[2]
    rows.append([seg,*s,r4,v[0],v[1],v3,age,tenure,income])
with open('m.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['segment','s1','s2','s3','r4','v1','v2','v3','age','tenure','income']); w.writerows(rows)
