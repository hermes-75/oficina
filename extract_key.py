#!/usr/bin/env python3
with open('/home/koday75/.hermes/.env') as f:
    for line in f:
        if line.startswith('DEEPSEEK_API_KEY='):
            val = line.strip().split('=', 1)[1]
            if val and val != '***':
                with open('/tmp/dk.txt', 'w') as out:
                    out.write(val)
                print(f"Wrote {len(val)} bytes")
            break
