import asyncio
from contextlib import aclosing

from fastapi import APIRouter, Request
from fastapi.sse import EventSourceResponse, ServerSentEvent

from app.schemas import BoardSnapshot, ChangeColumn, CreateCard, DeleteColumn, EditCard, ErrorResponse, MoveCard, ReorderColumns, RevisionEvent
from app.security import source_ip

router = APIRouter(prefix='/api',responses={status:{'model':ErrorResponse} for status in (400,403,404,409,413,415,422,500,503)})


async def write(request, action, operation):
    source = source_ip(request,request.app.state.trusted_proxies)
    return await request.app.state.writes.run(lambda:operation(source),action,source)


@router.get('/board',response_model=BoardSnapshot)
async def board(request:Request):
    return await asyncio.to_thread(request.app.state.store.snapshot)


@router.get('/events',response_class=EventSourceResponse,response_model=None)
async def events(request:Request):
    async with aclosing(request.app.state.events.stream()) as stream:
        async for revision in stream:
            yield ServerSentEvent(event='revision',id=str(revision),data=RevisionEvent(revision=revision),retry=1000)


@router.post('/cards',response_model=BoardSnapshot)
async def create_card(data:CreateCard,request:Request):
    return await write(request,'card.create',lambda source:request.app.state.store.create_card(data,source))


@router.patch('/cards/{card_id}',response_model=BoardSnapshot)
async def edit_card(card_id:str,data:EditCard,request:Request):
    return await write(request,'card.edit',lambda source:request.app.state.store.edit_card(card_id,data,source))


@router.post('/cards/{card_id}/move',response_model=BoardSnapshot)
async def move_card(card_id:str,data:MoveCard,request:Request):
    return await write(request,'card.move',lambda source:request.app.state.store.move_card(card_id,data,source))


@router.post('/columns',response_model=BoardSnapshot)
async def create_column(data:ChangeColumn,request:Request):
    return await write(request,'column.create',lambda source:request.app.state.store.create_column(data,source))


@router.patch('/columns/{column_id}',response_model=BoardSnapshot)
async def rename_column(column_id:str,data:ChangeColumn,request:Request):
    return await write(request,'column.rename',lambda source:request.app.state.store.rename_column(column_id,data,source))


@router.post('/columns/reorder',response_model=BoardSnapshot)
async def reorder_columns(data:ReorderColumns,request:Request):
    return await write(request,'column.reorder',lambda source:request.app.state.store.reorder_columns(data,source))


@router.delete('/columns/{column_id}',response_model=BoardSnapshot)
async def delete_column(column_id:str,data:DeleteColumn,request:Request):
    return await write(request,'column.delete',lambda source:request.app.state.store.delete_column(column_id,data,source))
