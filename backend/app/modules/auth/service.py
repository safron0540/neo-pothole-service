"""Регистрация, вход, обновление токенов и выход. Один сценарий — одна транзакция."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core import validators
from app.errors import ApiError
from app.modules.auth import security
from app.modules.auth.models import Citizen, ContractorUser, RefreshToken, User, UserConsent
from app.modules.auth.schemas import CitizenRegister, MeOut, TokenPair

STAFF_ROLES = ("dispatcher", "contractor")


def bad_credentials() -> ApiError:
    return ApiError(401, "invalid_credentials", "Неверный логин или пароль")


def bad_refresh() -> ApiError:
    return ApiError(401, "invalid_refresh_token", "Сессия истекла, войдите заново")


def _contractor_id(session: Session, user: User) -> int | None:
    if user.role != "contractor":
        return None
    return session.scalar(
        select(ContractorUser.contractor_id).where(ContractorUser.user_id == user.id)
    )


def _issue_tokens(session: Session, user: User, now: datetime) -> TokenPair:
    """Новая пара токенов; refresh записывается в БД только хэшем."""
    contractor_id = _contractor_id(session, user)
    refresh = security.new_refresh_token()
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=security.hash_refresh_token(refresh),
            expires_at=now + timedelta(days=get_settings().jwt_refresh_days),
        )
    )
    return TokenPair(
        access_token=security.create_access_token(user.id, user.role, contractor_id, now),
        refresh_token=refresh,
        role=user.role,
        contractor_id=contractor_id,
    )


def register_citizen(session: Session, body: CitizenRegister) -> TokenPair:
    """users + citizens + два согласия одной транзакцией (REQ-007, БЗ-4)."""
    if not (body.consent_pd and body.consent_geo):
        raise ApiError(422, "consent_required", "Нужны согласия на обработку ПДн и геолокацию")
    if not validators.is_strong_password(body.password):
        raise ApiError(
            422, "weak_password", "Пароль: не меньше 8 символов, заглавные и строчные буквы, цифры"
        )
    phone = validators.normalize_phone(body.phone)
    if phone is None:
        raise ApiError(422, "invalid_phone", "Телефон должен быть российским: +7XXXXXXXXXX")
    login = validators.normalize_login(body.email)
    if session.scalar(select(User.id).where(User.login == login)) is not None:
        raise ApiError(409, "email_taken", "Этот email уже зарегистрирован")
    if session.scalar(select(Citizen.user_id).where(Citizen.phone == phone)) is not None:
        raise ApiError(409, "phone_taken", "Этот телефон уже зарегистрирован")

    user = User(
        login=login,
        first_name=body.first_name.strip(),
        last_name=body.last_name.strip(),
        role="citizen",
        password_hash=security.hash_password(body.password),
    )
    session.add(user)
    session.flush()
    session.add(Citizen(user_id=user.id, phone=phone))
    version = get_settings().consent_version
    session.add_all(
        [UserConsent(user_id=user.id, kind=kind, doc_version=version) for kind in ("pd", "geo")]
    )
    tokens = _issue_tokens(session, user, datetime.now(UTC))
    session.commit()
    return tokens


def login(session: Session, login_: str, password: str, staff: bool) -> TokenPair:
    """Раздельные входы (REQ-001): гражданин не войдёт в панель, сотрудник — в приложение."""
    user = session.scalar(select(User).where(User.login == validators.normalize_login(login_)))
    allowed = STAFF_ROLES if staff else ("citizen",)
    if user is None or user.role not in allowed:
        security.hash_password(password)  # одинаковое время ответа: логин не угадать по задержке
        raise bad_credentials()
    if not security.verify_password(user.password_hash, password):
        raise bad_credentials()
    if not user.is_active:
        raise ApiError(403, "account_disabled", "Учётная запись отключена")
    tokens = _issue_tokens(session, user, datetime.now(UTC))
    session.commit()
    return tokens


def refresh(session: Session, token: str) -> TokenPair:
    """Ротация: старый refresh отзывается. Повтор отозванного — кража, отзываем все."""
    now = datetime.now(UTC)
    row = session.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == security.hash_refresh_token(token))
        .with_for_update()
    )
    if row is None or row.expires_at <= now:
        raise bad_refresh()
    if row.revoked_at is not None:
        _revoke_all(session, row.user_id, now)
        session.commit()
        raise bad_refresh()
    user = session.get(User, row.user_id)
    if user is None or not user.is_active:
        raise bad_refresh()
    row.revoked_at = now
    tokens = _issue_tokens(session, user, now)
    session.commit()
    return tokens


def _revoke_all(session: Session, user_id: int, now: datetime) -> None:
    session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )


def logout(session: Session, user_id: int, token: str) -> None:
    """Отзывает переданный refresh, если он принадлежит пользователю. Повтор не ошибка."""
    session.execute(
        update(RefreshToken)
        .where(
            RefreshToken.token_hash == security.hash_refresh_token(token),
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.now(UTC))
    )
    session.commit()


def me(session: Session, user_id: int) -> MeOut:
    user = session.get(User, user_id)
    if user is None or not user.is_active:
        raise ApiError(401, "unauthorized", "Нужен вход: учётная запись не найдена или отключена")
    phone = None
    if user.role == "citizen":
        phone = session.scalar(select(Citizen.phone).where(Citizen.user_id == user.id))
    return MeOut(
        id=user.id,
        login=user.login,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
        phone=phone,
        contractor_id=_contractor_id(session, user),
    )
