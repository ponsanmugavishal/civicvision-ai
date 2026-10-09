"""Public (unauthenticated) endpoints. Responses contain only approved public fields."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select

from ..auth import DB
from ..errors import not_found
from ..filters import ReportFilters, report_filters
from ..models import Report
from ..permissions import routing_map
from ..services import reports as svc
from .. import schemas as S

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/reports", response_model=list[S.PublicReportOut])
def list_public(db: DB, f: Annotated[ReportFilters, Depends(report_filters)]):
    rows = db.scalars(f.apply(select(Report), routing_map(db))).all()
    return [svc.public_out(r) for r in f.post_filter(list(rows))]


@router.get("/reports/by-public-id/{public_id}", response_model=S.PublicReportOut)
def by_public_id(public_id: str, db: DB):
    r = db.scalar(select(Report).where(Report.public_id == public_id.strip().upper()[:32]))
    if r is None:
        raise not_found(f"No complaint found with ID {public_id.strip().upper()[:32]}.")
    return svc.public_out(r)


@router.get("/reports/{report_id}", response_model=S.PublicBundleOut)
def public_detail(report_id: uuid.UUID, db: DB):
    return svc.public_bundle(db, svc.get_report(db, report_id))
