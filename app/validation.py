from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException

from app.security import error_response
from app.store import StoreError

# Never echo an arbitrary submitted field name or input value.
LOCATIONS = {'body','path','query','header','title','notes','columnId','jiraLinks','unassignedMattermostLinks','mattermostLinks','id','url','description','expectedVersion','targetColumnId','index','expectedBoardRevision','name','columnIds','card_id','column_id'}
LOCATIONS |= {'archive_id','requestId','cardIds','expectedMetadataVersion','isDone','q','cursor','limit'}


def install_errors(app):
    @app.exception_handler(RequestValidationError)
    async def invalid_request(request, error):
        fields = sorted({'.'.join(str(part) if isinstance(part,int) or part in LOCATIONS else 'unknown' for part in item['loc']) for item in error.errors()})
        return error_response('validation_error',422,fields)

    @app.exception_handler(StoreError)
    async def store_failure(request,error):
        status = 409 if error.code in {'conflict','archived','request_conflict','already_restored'} else 404 if error.code=='not_found' else 503 if error.code=='busy' else 400
        return error_response(error.code,status,archive_id=error.archive_id)

    @app.exception_handler(HTTPException)
    async def http_failure(request,error):
        return error_response('not_found' if error.status_code==404 else 'method_not_allowed' if error.status_code==405 else 'request_failed',error.status_code)
