"""Write narration lengths into the film page's NARR slot, or reset it to null with --reset."""
import json, re, sys
page = sys.argv[1]
val = 'null' if '--reset' in sys.argv else json.dumps(json.load(open('vo/lens.json'))['lens'])
s = open(page).read()
open(page, 'w').write(re.sub(r'/\*NARR\*/.*?/\*END\*/', '/*NARR*/' + val + '/*END*/', s))
