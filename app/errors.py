class StoreError(Exception):
    def __init__(self, code, archive_id=None):
        self.code = code
        self.archive_id = archive_id
        super().__init__(code)
