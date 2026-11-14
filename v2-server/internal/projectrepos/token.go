package projectrepos

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"github.com/wanglongan587/cloud/v2-server/internal/execution"
	"github.com/wanglongan587/cloud/v2-server/internal/store"
)

// ErrTokenUnavailable reports a token operation Cloud cannot perform, including a deployment
// without the encryption key or a ciphertext that does not open for this project.
var ErrTokenUnavailable = errors.New("project repository token unavailable")

// projectTokenUsername is the fixed HTTPS Basic username sent with a project token. Providers
// authenticate the token itself; a non-empty username satisfies Git's Basic scheme.
const projectTokenUsername = "x-access-token"

// tokenBinding ties a sealed token to one tenant, project and repository URL so a ciphertext
// copied to another project or repository cannot be opened.
func tokenBinding(tenantID, projectID, repositoryURL string) string {
	return tenantID + "\x00" + projectID + "\x00" + repositoryURL
}

func (s *Service) tokenCipher() (cipher.AEAD, error) {
	if len(s.credentialKey) != 32 {
		return nil, ErrTokenUnavailable
	}
	block, err := aes.NewCipher(s.credentialKey)
	if err != nil {
		return nil, ErrTokenUnavailable
	}
	return cipher.NewGCM(block)
}

func (s *Service) sealToken(token, binding string) ([]byte, error) {
	aead, err := s.tokenCipher()
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, ErrTokenUnavailable
	}
	return aead.Seal(nonce, nonce, []byte(token), []byte(binding)), nil
}

func (s *Service) openToken(sealed []byte, binding string) (string, error) {
	aead, err := s.tokenCipher()
	if err != nil {
		return "", err
	}
	if len(sealed) < aead.NonceSize() {
		return "", ErrTokenUnavailable
	}
	plain, err := aead.Open(nil, sealed[:aead.NonceSize()], sealed[aead.NonceSize():], []byte(binding))
	if err != nil {
		return "", ErrTokenUnavailable
	}
	return string(plain), nil
}

// SetRepositoryToken replaces the project's HTTPS token, or clears it when token is empty. Only the
// owner or the project creator may change it; authorization is checked before this call.
func (s *Service) SetRepositoryToken(ctx context.Context, scope execution.Scope, id, token string) (store.Project, error) {
	if strings.TrimSpace(token) != token || token == "" || len(token) > 4096 {
		return store.Project{}, execution.ErrInvalidRequest
	}
	return s.updateToken(ctx, scope, id, token)
}

// ClearRepositoryToken removes the project's token, so later pulls are anonymous.
func (s *Service) ClearRepositoryToken(ctx context.Context, scope execution.Scope, id string) (store.Project, error) {
	return s.updateToken(ctx, scope, id, "")
}

func (s *Service) updateToken(ctx context.Context, scope execution.Scope, id, token string) (store.Project, error) {
	unlock, err := s.lockProject(id)
	if err != nil {
		return store.Project{}, err
	}
	defer unlock()
	project, err := s.store.GetProject(ctx, scope, id)
	if err != nil {
		return store.Project{}, err
	}
	now := time.Now().UTC()
	if token == "" {
		project.RepositoryTokenSealed = nil
	} else {
		sealed, err := s.sealToken(token, tokenBinding(scope.TenantID, project.ID, project.RepositoryURL))
		if err != nil {
			return store.Project{}, err
		}
		project.RepositoryTokenSealed = sealed
	}
	project.RepositoryTokenSetAt = &now
	return s.store.UpdateProject(ctx, scope, project)
}

// credentialKeyFromEnv decodes the deployment key. A missing or malformed key disables token
// operations but leaves Cloud otherwise usable, as A4 D4 requires.
func credentialKeyFromEnv(value string) []byte {
	if value == "" {
		return nil
	}
	key, err := base64.StdEncoding.DecodeString(value)
	if err != nil || len(key) != 32 {
		return nil
	}
	return key
}
