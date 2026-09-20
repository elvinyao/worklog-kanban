import asyncio
from contextlib import aclosing

from fastapi import APIRouter, Request, Query
from fastapi.sse import EventSourceResponse, ServerSentEvent

from app.schemas import BoardSnapshot, ChangeColumn, CreateCard, DeleteColumn, EditCard, ErrorResponse, MoveCard, ReorderColumns, RevisionEvent
from app.security import source_ip
from app.archives import Archives
from app.schemas import ArchiveList, ArchiveDetail, ArchiveWrite, ArchiveLocation, CreateArchive, EditArchive, RestoreArchive, EditColumn

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
async def rename_column(column_id:str,data:EditColumn,request:Request):
    return await write(request,'column.rename',lambda source:request.app.state.store.rename_column(column_id,data,source))


@router.post('/columns/reorder',response_model=BoardSnapshot)
async def reorder_columns(data:ReorderColumns,request:Request):
    return await write(request,'column.reorder',lambda source:request.app.state.store.reorder_columns(data,source))


@router.delete('/columns/{column_id}',response_model=BoardSnapshot)
async def delete_column(column_id:str,data:DeleteColumn,request:Request):
    return await write(request,'column.delete',lambda source:request.app.state.store.delete_column(column_id,data,source))


@router.get('/archives',response_model=ArchiveList)
async def archives(request:Request,q:str=Query('',max_length=200),cursor:str|None=Query(None,max_length=512),limit:int=Query(20,ge=1,le=100)):
    return await asyncio.to_thread(Archives(request.app.state.store).list,q,cursor,limit)


@router.get('/archives/{archive_id}',response_model=ArchiveDetail)
async def archive_detail(archive_id:str,request:Request):
    return await asyncio.to_thread(Archives(request.app.state.store).detail,archive_id)


@router.get('/cards/{card_id}/archive',response_model=ArchiveLocation)
async def card_archive(card_id:str,request:Request):
    return await asyncio.to_thread(Archives(request.app.state.store).location,card_id)


@router.post('/archives',response_model=ArchiveWrite)
async def create_archive(data:CreateArchive,request:Request):
    return await write(request,'archive.create',lambda source:Archives(request.app.state.store).create(data,source))


@router.patch('/archives/{archive_id}',response_model=ArchiveWrite)
async def rename_archive(archive_id:str,data:EditArchive,request:Request):
    return await write(request,'archive.rename',lambda source:Archives(request.app.state.store).rename(archive_id,data,source))


@router.post('/archives/{archive_id}/restore',response_model=ArchiveWrite)
async def restore_archive(archive_id:str,data:RestoreArchive,request:Request):
    return await write(request,'archive.restore',lambda source:Archives(request.app.state.store).restore(archive_id,data,source))
