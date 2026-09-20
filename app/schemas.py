"""Shared API models only. Personal previews have no server-side schema."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator, field_validator

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


class JiraLinkInput(SharedModel):
    url: Link
    mattermostLinks: Annotated[list[MessageLinkInput], Field(max_length=20)] = Field(default_factory=list)


class UnassignedMessageInput(MessageLinkInput):
    id: Identifier


class CreateCard(SharedModel):
    title: Title
    columnId: Identifier
    notes: Notes = ''
    jiraLinks: Annotated[list[JiraLinkInput], Field(max_length=20)] = Field(default_factory=list)


class EditCard(SharedModel):
    expectedVersion: Version
    title: Title | None = None
    notes: Notes | None = None
    jiraLinks: Annotated[list[JiraLinkInput], Field(max_length=20)] | None = None
    unassignedMattermostLinks: Annotated[list[UnassignedMessageInput], Field(max_length=20)] | None = None

    @model_validator(mode='after')
    def patch_fields(self):
        fields = self.model_fields_set - {'expectedVersion'}
        if not fields or any(getattr(self, field) is None for field in fields):
            raise ValueError('Supply non-null editable fields')
        return self


class MoveCard(SharedModel):
    targetColumnId: Identifier
    index: Annotated[int, Field(ge=0)]
    expectedBoardRevision: Revision


class ChangeColumn(SharedModel):
    name: Name
    expectedBoardRevision: Revision


class EditColumn(SharedModel):
    name: Name | None = None
    isDone: bool | None = None
    expectedBoardRevision: Revision

    @model_validator(mode='after')
    def editable_fields(self):
        fields=self.model_fields_set-{'expectedBoardRevision'}
        if not fields or any(getattr(self,key) is None for key in fields):
            raise ValueError('Supply non-null editable fields')
        return self


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
    isDone: bool = False
    defaultNameKey: Literal['todo','investigating','implementing','unitTesting','integrationTesting','done'] | None = None


class MessageLink(MessageLinkInput):
    id: Identifier
    postId: str
    team: str
    position: Annotated[int, Field(ge=0)]


class JiraLink(SharedModel):
    id: Identifier
    key: str
    url: Link
    position: Annotated[int, Field(ge=0)]
    mattermostLinks: list[MessageLink]


class Card(SharedModel):
    id: Identifier
    columnId: Identifier
    title: Title
    notes: Notes
    position: Annotated[int, Field(ge=0)]
    version: Version
    jiraLinks: list[JiraLink]
    unassignedMattermostLinks: list[MessageLink]


class BoardSnapshot(SharedModel):
    revision: Revision
    columns: list[Column]
    cards: list[Card]
    archiveCount: Annotated[int, Field(ge=0)] = 0


class ArchiveSelection(SharedModel):
    requestId: Identifier
    expectedBoardRevision: Revision
    cardIds: Annotated[list[Identifier], Field(min_length=1,max_length=5000)]

    @model_validator(mode='after')
    def unique_cards(self):
        if len(set(self.cardIds))!=len(self.cardIds):
            raise ValueError('Duplicate card')
        return self


class ArchiveMetadata(SharedModel):
    name: Name
    description: Annotated[str, Field(max_length=500)] = ''

    @field_validator('name')
    @classmethod
    def nonempty_name(cls,value):
        if not value.strip():
            raise ValueError('Name is required')
        return value.strip()


class CreateArchive(ArchiveSelection, ArchiveMetadata):
    pass


class EditArchive(SharedModel):
    name: Name | None = None
    description: Annotated[str, Field(max_length=500)] | None = None
    expectedMetadataVersion: Version

    @model_validator(mode='after')
    def editable_fields(self):
        fields=self.model_fields_set-{'expectedMetadataVersion'}
        if not fields or any(getattr(self,key) is None for key in fields):
            raise ValueError('Supply non-null editable fields')
        if self.name is not None:
            self.name=self.name.strip()
            if not self.name:
                raise ValueError('Name is required')
        return self


class RestoreArchive(ArchiveSelection):
    targetColumnId: Identifier


class ArchiveSummary(ArchiveMetadata):
    id: Identifier
    createdAt: str
    sourceRevision: Revision
    metadataVersion: Version
    cardCount: Annotated[int, Field(ge=0)]
    jiraLinkCount: Annotated[int, Field(ge=0)]


class ArchiveDetail(ArchiveSummary):
    snapshot: BoardSnapshot
    restoredCards: dict[str,str]


class ArchiveList(SharedModel):
    items: list[ArchiveSummary]
    total: Annotated[int, Field(ge=0)]
    nextCursor: str | None = None


class ArchiveWrite(SharedModel):
    archiveId: Identifier
    board: BoardSnapshot
    restoredCards: dict[str,str] = Field(default_factory=dict)


class ArchiveLocation(SharedModel):
    archiveId: Identifier


class RevisionEvent(SharedModel):
    revision: Revision


class ErrorResponse(SharedModel):
    code: str
    fields: list[str] = Field(default_factory=list)
    archiveId: Identifier | None = None
