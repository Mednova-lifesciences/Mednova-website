from urllib.request import Request, HTTPRedirectHandler, build_opener
from urllib.error import HTTPError
urls = [
    'https://mednovalife.com/careers',
    'https://mednovalife.com/participants',
    'https://mednovalife.com/medical-writing',
    'https://mednovalife.com/clinical-trial-operations',
    'https://mednovalife.com/pharmacovigilance-drug-safety',
    'https://mednovalife.com/regulatory-affairs-nafdac-navigation',
    'https://mednovalife.com/outbreak-emergency-research',
    'https://mednovalife.com/contact-us'
]
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None
opener = build_opener(NoRedirect)
for url in urls:
    req = Request(url, method='HEAD')
    try:
        res = opener.open(req, timeout=20)
        print(url, res.status, res.getheader('Location'))
    except HTTPError as e:
        print(url, e.code, e.headers.get('Location'))
