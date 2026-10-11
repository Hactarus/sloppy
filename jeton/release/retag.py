#!/usr/bin/env python3
"""retag.py IN.tar OUT.tar TAG... : rewrite RepoTags of a `docker save` style tarball (as written by `crane pull --format tarball`)."""
import json, sys, tarfile, io

src, dst, *tags = sys.argv[1:]
with tarfile.open(src) as i, tarfile.open(dst, "w") as o:
    for m in i:
        data = i.extractfile(m).read() if m.isfile() else None
        if m.name == "manifest.json":
            mf = json.loads(data)
            for e in mf:
                e["RepoTags"] = tags
            data = json.dumps(mf).encode()
            m.size = len(data)
        m.mtime = 0
        o.addfile(m, io.BytesIO(data) if data is not None else None)
