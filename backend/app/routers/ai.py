from typing import Annotated

from fastapi import APIRouter, File, Query, UploadFile

from ..auth import DB, CurrentUser
from ..config import get_settings
from ..errors import invalid
from ..models import AiSuggestion
from ..services import ai, duplicates, rate_limit
from ..services.uploads import read_image
from .. import schemas as S

router = APIRouter(prefix="/api", tags=["ai"])


@router.post("/ai/classify-issue", response_model=S.AiClassifyOut)
async def classify_issue(user: CurrentUser, db: DB, photo: UploadFile | None = File(default=None)):
    """Suggest a category for a photo using a pretrained Gemini model. The citizen always confirms the category."""
    data, ctype, _ = await read_image(photo)
    if not ai.is_configured():
        return S.AiClassifyOut(available=False, message="AI assistance unavailable — please choose the category yourself.")
    rate_limit.check(f"ai:{user.id}", get_settings().ai_rate_limit_per_hour)
    try:
        result = ai.classify(data, ctype)
    except ai.AiUnavailable as e:
        return S.AiClassifyOut(available=False, message=str(e))
    row = AiSuggestion(
        user_id=user.id, model=get_settings().gemini_model, suggested_category=result.suggested_category, explanation=result.explanation,
        visible_indicators=result.visible_indicators, uncertainty_warning=result.uncertainty_warning, suggested_severity=result.suggested_severity, image_sha256=ai.image_hash(data),
    )
    db.add(row)
    db.commit()
    return S.AiClassifyOut(available=True, message="Suggestion from a pretrained AI model — please check it and confirm the category yourself.", suggestion=S.AiSuggestionOut.model_validate(row))


@router.get("/duplicates", response_model=list[S.DuplicateCandidateOut])
def duplicate_check(
    user: CurrentUser,
    db: DB,
    lat: Annotated[float, Query(ge=-90, le=90)],
    lng: Annotated[float, Query(ge=-180, le=180)],
    category: Annotated[str, Query(max_length=20)],
    description: Annotated[str, Query(max_length=1000)] = "",
):
    """Possible existing reports of the same issue nearby. Warning only — the citizen may still submit."""
    if category not in duplicates.COMPATIBLE:
        raise invalid("Unknown category.", {"category": "Invalid"})
    return [
        S.DuplicateCandidateOut(id=c.report.id, public_id=c.report.public_id, category=c.report.category, status=c.report.status, distance_m=c.distance_m, reported_at=c.report.reported_at, description=c.report.description[:200], text_similarity=c.text_similarity)  # type: ignore[arg-type]
        for c in duplicates.find(db, lat, lng, category, description)
    ]
