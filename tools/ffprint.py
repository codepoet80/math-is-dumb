"""Print a page to PDF using real Firefox via the built-in Marionette protocol.
No geckodriver needed: Marionette is a length-prefixed JSON socket protocol."""
import base64, json, socket, subprocess, sys, tempfile, time, os, shutil

FF = '/Applications/Firefox.app/Contents/MacOS/firefox'

class Marionette:
    def __init__(self, port):
        self.s = socket.create_connection(('127.0.0.1', port), timeout=60)
        self.buf = b''
        self.mid = 0
        self._read()                       # server handshake

    def _read(self):
        while b':' not in self.buf:
            self.buf += self.s.recv(65536)
        n, _, rest = self.buf.partition(b':')
        n = int(n)
        while len(rest) < n:
            rest += self.s.recv(65536)
        self.buf = rest[n:]
        return json.loads(rest[:n])

    def cmd(self, name, params=None):
        self.mid += 1
        msg = json.dumps([0, self.mid, name, params or {}])
        self.s.sendall(('%d:%s' % (len(msg), msg)).encode())
        while True:
            r = self._read()
            if isinstance(r, list) and len(r) >= 3 and r[1] == self.mid:
                if r[2]:
                    raise RuntimeError('%s -> %s' % (name, r[2]))
                return r[3]

def print_pdf(url, out, port=2829):
    prof = tempfile.mkdtemp()
    # Marionette's port comes from a profile pref, not an env var.
    with open(os.path.join(prof, 'user.js'), 'w') as f:
        f.write('user_pref("marionette.port", %d);\n' % port)
        f.write('user_pref("marionette.enabled", true);\n')
        f.write('user_pref("browser.shell.checkDefaultBrowser", false);\n')
    log = open(os.path.join(prof, 'ff.log'), 'w')
    p = subprocess.Popen([FF, '--headless', '--marionette', '--profile', prof,
                          '--new-instance', 'about:blank'],
                         stdout=log, stderr=log)
    try:
        m = None
        for _ in range(60):
            try:
                m = Marionette(port); break
            except OSError:
                time.sleep(0.5)
        if not m:
            raise RuntimeError('could not reach Marionette on %d' % port)
        m.cmd('WebDriver:NewSession', {'capabilities': {}})
        m.cmd('WebDriver:Navigate', {'url': url})
        time.sleep(3)
        res = m.cmd('WebDriver:Print', {
            'background': False,
            'page': {'width': 21.59, 'height': 27.94},          # letter, cm
            'margin': {'top': 0, 'bottom': 0, 'left': 0, 'right': 0},
        })
        data = res['value'] if isinstance(res, dict) and 'value' in res else res
        open(out, 'wb').write(base64.b64decode(data))
        print('wrote', out)
    finally:
        p.terminate()
        shutil.rmtree(prof, ignore_errors=True)

if __name__ == '__main__':
    print_pdf(sys.argv[1], sys.argv[2])
