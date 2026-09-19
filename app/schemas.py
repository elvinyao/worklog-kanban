"""Shared API models only. Personal previews have no server-side schema."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Identifier = Annotated[str, Field(min_length=1, max_length=100, pattern=r'^[A-Za-z0-9_-]+$')]
Title = Annotated[str, Field(min_length=1, max_length=200)]
Name = Annotated[str, Field(min_length=1, max_length=80)]
Notes = Annotated[str, Field(max_length=20000)]
Link = Annotated[str, Field(min_length=1, max_length=2048)]
Revision = Annotated[int, Field(ge=0)]
Version = Annotated[int, Field(ge=1)]


class SharedModel(BaseModel):
    model_config = ConfigDict(strict=True, extra='forbid')


class MessageLinkInput(SharedModel):
    url: Link
    description: Annotated[str, Field(max_length=2000)] = ''


class CreateCard(SharedModel):
    title: Title
    columnId: Identifier
    notes: Notes = ''
    jiraUrl: Link | None = None
    mattermostLinks: Annotated[list[MessageLinkInput], Field(max_length=20)] = Field(default_factory=list)


class EditCard(SharedModel):
    expectedVersion: Version
    title: Title | None = None
    notes: Notes | None = None
    jiraUrl: Link | None = None
    mattermostLinks: Annotated[list[MessageLinkInput], Field(max_length=20)] | None = None

    @model_validator(mode='after')
    def patch_fields(self):
        fields = self.model_fields_set - {'expectedVersion'}
        if not fields or any(getattr(self, field) is None for field in fields - {'jiraUrl'}):
            raise ValueError('Supply non-null editable fields; jiraUrl alone may be null')
        return self


class MoveCard(SharedModel):
    targetColumnId: Identifier
    index: Annotated[int, Field(ge=0)]
    expectedBoardRevision: Revision


class ChangeColumn(SharedModel):
    name: Name
    expectedBoardRevision: Revision


class ReorderColumns(SharedModel):
    columnIds: Annotated[list[Identifier], Field(min_length=1, max_length=100)]
    expectedBoardRevision: Revision

    @model_validator(mode='after')
    def unique_ids(self):
        if len(set(self.columnIds)) != len(self.columnIds):
            raise ValueError('Duplicate column')
        return self


class DeleteColumn(SharedModel):
    targetColumnId: Identifier
    expectedBoardRevision: Revision


class Column(SharedModel):
    id: Identifier
    name: Name
    position: Annotated[int, Field(ge=0)]
    defaultNameKey: Literal['todo','investigating','implementing','unitTesting','integrationTesting','done'] | None = None


class JiraLink(SharedModel):
    key: str
    url: Link


class MessageLink(MessageLinkInput):
    id: Identifier
    postId: str
    team: str
    position: Annotated[int, Field(ge=0)]


class Card(SharedModel):
    id: Identifier
    columnId: Identifier
    title: Title
    notes: Notes
    position: Annotated[int, Field(ge=0)]
    version: Version
    jira: JiraLink | None
    mattermostLinks: list[MessageLink]


class BoardSnapshot(SharedModel):
    revision: Revision
    columns: list[Column]
    cards: list[Card]


class RevisionEvent(SharedModel):
    revision: Revision


class ErrorResponse(SharedModel):
    code: str
    fields: list[str] = Field(default_factory=list)
