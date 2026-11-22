"""Drop OAuth query values from Uvicorn's access-log arguments."""

import logging


class RedactOAuthQuery(logging.Filter):
    def filter(self, record):
        if isinstance(record.args, tuple) and len(record.args) == 5:
            args = list(record.args)
            if isinstance(args[2], str) and args[2].startswith("/oauth/"):
                args[2] = args[2].split("?", 1)[0]
                record.args = tuple(args)
        return True


def install():
    logging.getLogger("uvicorn.access").addFilter(RedactOAuthQuery())
